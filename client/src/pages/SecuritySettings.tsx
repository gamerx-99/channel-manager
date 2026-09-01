import { useParams } from "wouter";
import MfaSettings from "@/components/MfaSettings";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useHotel } from "@/contexts/HotelContext";

export default function SecuritySettings() {
  const { selectedHotel } = useHotel();
  const hotelId = useParams<{ hotelId?: string }>().hotelId || selectedHotel?.id;

  return (
    <div className="page-content">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">Settings / Security</div>
          <h1>
            Security<span className="title-mark">.</span>
          </h1>
          <p className="lede">Manage your authenticator app, payment integration, and step-up verification for sensitive actions.</p>
        </div>
      </section>
      <MfaSettings />
      {hotelId && <SlipOkSettings hotelId={hotelId} />}
    </div>
  );
}
