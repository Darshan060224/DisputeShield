import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  { label: "Customer payment", kind: "LOCAL + RAZORPAY", text: "Customer chooses a product in Customer Space and explicitly opens Razorpay Checkout. This walkthrough does not open Checkout or create a payment." },
  { label: "Payment fact verification", kind: "VERIFIED FACT", text: "DisputeShield separates Checkout return, client signature, Razorpay API observation, and signed payment webhook confirmation." },
  { label: "Local issue and evidence", kind: "CUSTOMER SPACE", text: "The buyer can report an issue, upload evidence, and confirm OCR candidate facts. This creates a local customer case, never a Razorpay dispute." },
  { label: "Seller evidence review", kind: "SELLER SPACE", text: "The merchant reviews the order, payment reference, fulfilment state, delivery evidence, and local resolution readiness." },
  { label: "Bank-initiated dispute", kind: "RAZORPAY DEPENDENCY", text: "The customer independently contacts the issuing bank. The issuer and network may raise a dispute to Razorpay. Customer Space cannot trigger this stage." },
  { label: "Signed webhook ingestion", kind: "RAZORPAY DEPENDENCY", text: "Razorpay sends a signed event to the published DisputeShield endpoint. HMAC validation, merchant scope, idempotency, and external metadata are checked before persistence." },
  { label: "AI evidence analysis", kind: "ASSISTED REVIEW", text: "The system classifies reason and phase, reads the response deadline, identifies evidence gaps, and prepares a conservative review recommendation." },
  { label: "Merchant packet preparation", kind: "MERCHANT GATE", text: "The merchant may prepare a packet for a verified signed external dispute. No contest, refund, appeal, or outcome is submitted automatically." },
] as const;

export default function GuidedDisputeDemo() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  if (!open) {
    return <Button variant="outline" className="guided-demo-trigger" onClick={() => setOpen(true)}><ShieldCheck size={15} /> Guided lifecycle demo</Button>;
  }

  return <div className="guided-demo-card" role="dialog" aria-label="Guided dispute lifecycle demo">
    <div className="guided-demo-head"><div><div className="eyebrow"><ShieldCheck size={13} /> Safe presentation mode</div><h2>Bank → Razorpay → merchant review</h2><p>Walk through the full lifecycle without creating a payment, dispute, refund, or webhook record.</p></div><button className="guided-demo-close" aria-label="Close guided demo" onClick={() => setOpen(false)}><X size={16} /></button></div>
    <div className="guided-demo-progress" aria-label={`Demo step ${stepIndex + 1} of ${steps.length}`}><span>STEP {String(stepIndex + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span><div>{steps.map((item, index) => <i key={item.label} className={index <= stepIndex ? "complete" : ""} />)}</div></div>
    <div className="guided-demo-step"><div className="guided-demo-icon">{step.kind.includes("DEPENDENCY") ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}</div><div><span className="guided-demo-kind">{step.kind}</span><h3>{step.label}</h3><p>{step.text}</p></div></div>
    <div className="guided-demo-actions"><small>{stepIndex === steps.length - 1 ? "End state: merchant-controlled preparation only" : "Next: continue the lifecycle explanation"}</small><Button onClick={() => stepIndex === steps.length - 1 ? setOpen(false) : setStepIndex(value => value + 1)}>{stepIndex === steps.length - 1 ? "Finish demo" : "Next step"} <ArrowRight size={15} /></Button></div>
  </div>;
}
