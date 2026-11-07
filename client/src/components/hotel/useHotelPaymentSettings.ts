import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMfaStepUp } from "@/lib/mfa";
import { normalisePromptPayId } from "../../../../shared/promptPayId";
import { useTranslation } from "@/lib/i18n";

export function useHotelPromptPaySettings(hotelId: string) {
  const [promptPayId, setPromptPayId] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(15);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const { t } = useTranslation();
  const settings = trpc.slipok.getPromptPaySettings.useQuery({ hotel_id: hotelId });
  const savedId = settings.data?.promptpay_id;
  const savedIdInvalid = Boolean(savedId && !normalisePromptPayId(savedId));
  const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
  const savePromptPay = trpc.slipok.savePromptPayId.useMutation({
    onSuccess() {
      void settings.refetch();
      setSaved(true);
      setSaveError(null);
      setPromptPayId("");
      reset();
      setTimeout(() => setSaved(false), 3000);
    },
    onError(err) {
      if (err.data?.code === "PRECONDITION_FAILED") {
        void triggerStepUp();
        return;
      }
      setSaveError(err.data?.code === "BAD_REQUEST" ? t("financials.promptPayInvalid") : err.message);
    },
  });
  const save = () => {
    const normalised = normalisePromptPayId(promptPayId);
    if (!normalised) {
      setSaveError(t("financials.promptPayInvalid"));
      return;
    }
    savePromptPay.mutate({ hotel_id: hotelId, promptpay_id: normalised.value, payment_timeout_minutes: timeoutMin });
  };
  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    if (!normalisePromptPayId(promptPayId)) {
      setSaveError(t("financials.promptPayInvalid"));
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
