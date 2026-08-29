import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const productBoundDemoSteps = [
  { label: "Merchant creates the product", kind: "SELLER SPACE", href: "/seller-space", text: "Open Seller Space and add or select the local merchant product. This creates the catalogue/order context; it does not create a payment." },
  { label: "Customer opens the product", kind: "CUSTOMER SPACE", href: "/customer-space", text: "Open Customer Space and use the protected merchant catalog or order access. Browsing is read-only and cannot create a payment or dispute." },
  { label: "Customer explicitly chooses to pay", kind: "CHECKOUT GATE", href: "/customer-space", text: "The buyer selects Buy with Razorpay. Stop at the hosted Checkout screen during the demo unless the merchant explicitly authorizes one Test Mode payment attempt." },
  { label: "Payment facts are verified", kind: "RAZORPAY FACTS", href: "/payments", text: "DisputeShield separates order creation, Checkout return, client signature, Razorpay API observation, and signed payment webhook confirmation. Only verified facts update captured metrics." },
  { label: "Merchant records fulfilment", kind: "SELLER SPACE", href: "/seller-space", text: "The merchant records the operational fulfilment state and delivery evidence. An unfulfilled local order is not automatically a chargeback." },
  { label: "Customer reports an issue", kind: "LOCAL RESOLUTION", href: "/customer-space", text: "The buyer may submit non-delivery, return, damage, wrong amount, duplicate, or refund concerns with protected evidence. This creates a local customer case only." },
  { label: "OCR facts are confirmed", kind: "EVIDENCE ASSIST", href: "/customer-space#evidence-vault", text: "AI OCR (GPT-5-6 Luna) extracts candidate fields. The customer confirms or corrects them before submission; OCR never proves a bank dispute or refund." },
  { label: "Merchant reviews the case", kind: "MERCHANT REVIEW", href: "/#customer-handoff", text: "Seller Space and Merchant Home show the order, fulfilment, evidence gaps, return receipt, and local resolution state. The merchant decides the local next step." },
  { label: "Automation checks refund readiness", kind: "REFUND PREPARATION", href: "/#customer-handoff", text: "The workflow matches the order, trusted Razorpay payment fact, return receipt, and customer-confirmed evidence. It prepares a refund recommendation and lists any exception instead of moving money." },
  { label: "Merchant approves the refund", kind: "REFUND GATE", href: "/#customer-handoff", text: "A merchant explicitly reviews the amount, payment reference, evidence, and consequence. The guided Next action only demonstrates this gate; it never approves or submits a real refund." },
  { label: "Razorpay refund is initiated", kind: "RAZORPAY WRITE GATE", href: "/payments", text: "In a live run, a separate merchant-confirmed action may call the Razorpay refund API for the verified captured payment. The UI must show the exact amount and payment ID before confirmation." },
  { label: "Refund outcome is verified", kind: "RAZORPAY FACTS", href: "/#external-disputes", text: "The refund is considered processed only after a trusted Razorpay API result or signed refund webhook is reconciled. A browser click alone cannot increase refund metrics." },
  { label: "External dispute arrives independently", kind: "RAZORPAY DEPENDENCY", href: "/#external-disputes", text: "If the customer contacts the issuer and a bank/network dispute reaches Razorpay, a signed Razorpay webhook can enter the external command centre. Customer Space cannot trigger it." },
  { label: "Merchant prepares the response", kind: "MERCHANT GATE", href: "/#external-disputes", text: "AI classifies the observed reason and evidence gaps. The merchant may prepare a packet for a verified signed external dispute; contest, appeal, and outcome submission remain blocked." },
] as const;

export default function ProductBoundDemo() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = productBoundDemoSteps[stepIndex];

  if (!open) return <Button variant="outline" className="product-demo-trigger" onClick={() => setOpen(true)}><ShieldCheck size={15} /> Product-bound demo</Button>;

  return <div className="guided-demo-card product-demo-card" role="dialog" aria-label="Product-bound lifecycle demo">
    <div className="guided-demo-head"><div><div className="eyebrow"><ShieldCheck size={13} /> Product-bound presentation mode</div><h2>Product → payment → evidence → review</h2><p>Follow the real screens in order. Checkout and external dispute stages pause for explicit user-controlled action.</p></div><button className="guided-demo-close" aria-label="Close product-bound demo" onClick={() => setOpen(false)}><X size={16} /></button></div>
    <div className="guided-demo-progress" aria-label={`Product demo step ${stepIndex + 1} of ${productBoundDemoSteps.length}`}><span>STEP {String(stepIndex + 1).padStart(2, "0")} / {String(productBoundDemoSteps.length).padStart(2, "0")}</span><div>{productBoundDemoSteps.map((item, index) => <i key={item.label} className={index <= stepIndex ? "complete" : ""} />)}</div></div>
    <div className="guided-demo-step"><div className="guided-demo-icon">{step.kind.includes("GATE") || step.kind.includes("DEPENDENCY") ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}</div><div><span className="guided-demo-kind">{step.kind}</span><h3>{step.label}</h3><p>{step.text}</p><a className="product-demo-link" href={step.href}>Open related screen <ExternalLink size={12} /></a></div></div>
    <div className="guided-demo-actions"><small>{stepIndex === 2 ? "Pause here before hosted Checkout" : stepIndex === 8 ? "Pause here: merchant refund review is required" : stepIndex === 12 ? "Pause here: real Razorpay refund requires explicit confirmation" : stepIndex === 15 ? "Pause here: external dispute must come from bank/Razorpay" : stepIndex === productBoundDemoSteps.length - 1 ? "End state: merchant-controlled preparation only" : "Continue without mutating external state"}</small><Button onClick={() => stepIndex === productBoundDemoSteps.length - 1 ? setOpen(false) : setStepIndex(value => value + 1)}>{stepIndex === productBoundDemoSteps.length - 1 ? "Finish demo" : "Next step"} <ArrowRight size={15} /></Button></div>
  </div>;
}
