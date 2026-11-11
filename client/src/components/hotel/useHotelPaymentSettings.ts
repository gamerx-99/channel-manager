import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMfaStepUp } from "@/lib/mfa";
import { checkPromptPayIdForSave, normalisePromptPayId } from "../../../../shared/promptPayId";
import { useTranslation } from "@/lib/i18n";

export function useHotelPromptPaySettings(hotelId: string) {
  const [promptPayId, setPromptPayId] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(15);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const { t } = useTranslation();
  const settings = trpc.slipok.getPromptPaySettings.useQuery({ hotel_id: hotelId });
  const activeHotelId = useRef(hotelId);
  const loadedHotelId = useRef<string | null>(null);
  useEffect(() => {
    if (activeHotelId.current !== hotelId) {
      activeHotelId.current = hotelId;
      loadedHotelId.current = null;
      setPromptPayId("");
      setTimeoutMin(15);
    }
    if (settings.data === undefined || loadedHotelId.current === hotelId) return;
    loadedHotelId.current = hotelId;
    setPromptPayId(settings.data?.promptpay_id ?? "");
    setTimeoutMin(settings.data?.payment_timeout_minutes ?? 15);
  }, [hotelId, settings.data]);
  const savedId = settings.data?.promptpay_id;
  const savedIdInvalid = Boolean(savedId && !normalisePromptPayId(savedId));
  const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
  const invalidMessage = (problem: "format" | "id_checksum") => t(problem === "id_checksum" ? "financials.promptPayIdChecksum" : "financials.promptPayInvalid");
  const savePromptPay = trpc.slipok.savePromptPayId.useMutation({
    onSuccess(_data, variables) {
      void settings.refetch();
      setSaved(true);
      setSaveError(null);
      setPromptPayId(variables.promptpay_id);
      reset();
      setTimeout(() => setSaved(false), 3000);
    },
    onError(err) {
      if (err.data?.code === "PRECONDITION_FAILED") {
        void triggerStepUp();
        return;
      }
      setSaveError(err.data?.code === "BAD_REQUEST" ? invalidMessage(/check digit/.test(err.message) ? "id_checksum" : "format") : err.message);
    },
  });
  const save = () => {
    const checked = checkPromptPayIdForSave(promptPayId);
    if (!checked.ok) {
      setSaveError(invalidMessage(checked.problem));
      return;
    }
    savePromptPay.mutate({ hotel_id: hotelId, promptpay_id: checked.value, payment_timeout_minutes: timeoutMin });
  };
  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    const checked = checkPromptPayIdForSave(promptPayId);
    if (!checked.ok) {
      setSaveError(invalidMessage(checked.problem));
      return;
    }
    if ((await triggerStepUp()) === "verified") save();
  }
  async function handleVerify() {
    if (await submitTotp(totpCode)) {
      setTotpCode("");
      save();
    }
  }
  function handleCancel() {
    setTotpCode("");
    reset();
  }
  return { promptPayId, setPromptPayId, timeoutMin, setTimeoutMin, saveError, saved, savedIdInvalid, totpCode, setTotpCode, mfaState, savePromptPay, handleSave, handleVerify, handleCancel };
}
