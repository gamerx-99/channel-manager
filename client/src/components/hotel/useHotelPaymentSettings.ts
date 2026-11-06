import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMfaStepUp } from "@/lib/mfa";

export function useHotelPromptPaySettings(hotelId: string) {
  const [promptPayId, setPromptPayId] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(15);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
  const savePromptPay = trpc.slipok.savePromptPayId.useMutation({
    onSuccess() {
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
      setSaveError(err.message);
    },
  });
  const save = () => savePromptPay.mutate({
    hotel_id: hotelId,
    promptpay_id: promptPayId.replace(/\D/g, ""),
    payment_timeout_minutes: timeoutMin,
  });
  async function handleSave() {
    setSaveError(null);
    setSaved(false);
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
  return { promptPayId, setPromptPayId, timeoutMin, setTimeoutMin, saveError, saved, totpCode, setTotpCode, mfaState, savePromptPay, handleSave, handleVerify, handleCancel };
}
