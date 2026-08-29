import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { RAZORPAY_TEST_CARD, RAZORPAY_TEST_NETBANKING, RAZORPAY_TEST_UPI, isRazorpayTestKey, paymentAmountMessage } from "@/lib/razorpayTestMode";
import { shouldLockTestCardRetries, testCardRetryLockMessage, type RazorpayCheckoutFailure } from "@/lib/testCardRetryGuard";
import { Button } from "@/components/ui/button";
import MerchantWorkspaceShell from "@/components/MerchantWorkspaceShell";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, CircleDollarSign, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";

type CheckoutResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type CheckoutInstance = { open: () => void; on?: (event: string, handler: (response: RazorpayCheckoutFailure) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => CheckoutInstance;
  }
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (status: string) => status.replaceAll("_", " ");

export default function Payments() {
  const { user, isAuthenticated } = useAuth();
  const [amount, setAmount] = useState("1");
  const [purpose, setPurpose] = useState<"merchant_payment" | "evidence_intake">("merchant_payment");
  const [cardRetryLockedOrderId, setCardRetryLockedOrderId] = useState<string | null>(null);
  const createIntake = trpc.createPaymentIntake.useMutation();
  const checkoutOpened = trpc.markPaymentCheckoutOpened.useMutation();
  const verifyIntake = trpc.verifyPaymentIntake.useMutation();
  const resumeIntake = trpc.resumePaymentIntakeCheckout.useMutation();
  const checkoutConfig = trpc.paymentCheckoutConfig.useQuery(undefined, { enabled: isAuthenticated });
  const intakes = trpc.paymentIntakes.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 10_000 });

  async function launchCheckout(order: { orderId: string; amountPaise: number; currency: string; keyId?: string; checkoutMode: "test" | "live"; receipt: string; purpose: "merchant_payment" | "evidence_intake" }) {
    if (!order.keyId) { toast.error("Razorpay public key is unavailable. Checkout was not opened."); return; }
    if (order.checkoutMode === "test" || isRazorpayTestKey(order.keyId)) {
      toast.message("Razorpay test checkout", { description: `Preferred route: ${RAZORPAY_TEST_NETBANKING.method} → any listed bank → Success. Card fallback: ${RAZORPAY_TEST_CARD.number}.` });
    }
    const ready = await loadRazorpayCheckout();
    if (!ready || !window.Razorpay) { toast.error("Razorpay checkout could not be loaded. No payment was started."); return; }
    checkoutOpened.mutate({ orderId: order.orderId });
    const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency,
          name: "DisputeShield merchant intake",
          description: purpose === "merchant_payment" ? "Merchant payment collection" : "Evidence-linked payment intake",
          order_id: order.orderId,
          notes: { receipt: order.receipt, purpose },
          handler: (response: CheckoutResponse) => {
            verifyIntake.mutate({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }, {
              onSuccess: result => { toast.success("Checkout signature verified", { description: result.message }); intakes.refetch(); },
              onError: error => toast.error(error.message),
            });
          },
          modal: { ondismiss: () => { toast.message("Checkout closed. No payment was treated as captured."); intakes.refetch(); } },
          retry: order.checkoutMode === "test" ? { enabled: false } : undefined,
          theme: { color: "#2f80e8" },
        });
    checkout.on?.("payment.failed", failure => {
      if (order.checkoutMode === "test" && shouldLockTestCardRetries(failure)) {
        setCardRetryLockedOrderId(order.orderId);
        toast.error(testCardRetryLockMessage(failure));
      }
      intakes.refetch();
    });
    checkout.open();
  }

  async function openCheckout() {
    if (!isAuthenticated) { startLogin(); return; }
    const amountRupees = Number(amount);
    const amountError = paymentAmountMessage(amountRupees);
    if (amountError) { toast.error(amountError); return; }
    createIntake.mutate({ amountRupees, purpose }, { onSuccess: launchCheckout, onError: error => toast.error(error.message) });
  }

  function resumeWithNetbanking() {
    if (!cardRetryLockedOrderId) return;
    resumeIntake.mutate({ orderId: cardRetryLockedOrderId }, { onSuccess: launchCheckout, onError: error => toast.error(error.message) });
  }

  return <MerchantWorkspaceShell><div className="payments-page">
    <header className="merchant-topbar"><div className="brand-mark"><span className="brand-slash">◢</span><span>DisputeShield</span></div><nav className="top-links"><Link href="/">Merchant home</Link><strong>Payments</strong><span>Risk operations</span><span>Reports</span></nav><div className="top-actions"><span className="secure-flag"><LockKeyhole size={13} /> Merchant controlled</span><button className="avatar">{user?.name?.slice(0, 2).toUpperCase() ?? "AM"}</button></div></header>
    <main className="payments-main">
      <Link href="/" className="back-link"><ArrowLeft size={15} /> Back to dispute operations</Link>
      <section className="payments-heading"><div><div className="eyebrow">Merchant payment intake</div><h1>Collect a payment through Razorpay</h1><p>Create a Razorpay order, open the official checkout, then wait for a signature-verified webhook event before DisputeShield reflects a captured payment.</p></div><div className="payments-guard"><ShieldCheck size={19} /><span><strong>No automatic charge</strong>Checkout opens only after your explicit action.</span></div></section>
      <section className="payment-grid">
        <article className="intake-panel">
          <div className="panel-icon"><CircleDollarSign size={23} /></div><h2>Create payment request</h2><p>Use this for a merchant-led collection. The customer completes payment in the official Razorpay checkout.</p>
          <label className="amount-label">Amount <span>INR</span><div className="amount-field"><b>₹</b><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-label="Payment amount in rupees" /></div></label>
          <div className="purpose-toggle"><button className={purpose === "merchant_payment" ? "active" : ""} onClick={() => setPurpose("merchant_payment")}><WalletCards size={16} /><span>Payment collection<small>Reflects as a merchant payment after capture</small></span></button><button className={purpose === "evidence_intake" ? "active" : ""} onClick={() => setPurpose("evidence_intake")}><ShieldCheck size={16} /><span>Evidence intake<small>Links a future verified payment to evidence</small></span></button></div>
          {checkoutConfig.data?.mode === "test" && <div className={`test-card-guidance ${cardRetryLockedOrderId ? "retry-locked" : ""}`} role="note"><div><span>Razorpay test mode</span><strong>{cardRetryLockedOrderId ? "Card retries paused" : "No real money is deducted"}</strong></div><p><b>Recommended no-OTP route:</b> choose <b>{RAZORPAY_TEST_NETBANKING.method}</b>, choose any listed bank, then select <b>Success</b> on Razorpay’s mock bank page.</p><div className="test-card-details"><span><b>UPI if shown</b><code>{RAZORPAY_TEST_UPI.successId}</code></span><span><b>Card fallback</b><code>{RAZORPAY_TEST_CARD.number}</code></span><span><b>Card OTP</b>{RAZORPAY_TEST_CARD.mockOtp}</span></div>{cardRetryLockedOrderId && <Button type="button" variant="outline" className="netbanking-fallback" onClick={resumeWithNetbanking} disabled={resumeIntake.isPending}><WalletCards size={14} /> {resumeIntake.isPending ? "Opening checkout…" : "Continue this order with Netbanking"}</Button>}<small><b>Card guidance:</b> use the domestic Mastercard above with any future expiry and any three-digit CVV. Card retry is disabled after a test-mode card failure so the same order is resumed through Netbanking. DisputeShield validates only the amount and creates the order. Razorpay Checkout validates card fields, OTP and whichever payment methods are enabled for this account.</small></div>}
          <Button className="pay-button" onClick={openCheckout} disabled={createIntake.isPending || checkoutOpened.isPending || verifyIntake.isPending}><ExternalLink size={16} /> {createIntake.isPending ? "Creating order…" : "Open Razorpay checkout"}</Button>
          <p className="payment-disclaimer"><LockKeyhole size={13} /> The amount is not collected here. Razorpay checkout controls payment authentication; DisputeShield waits for signature verification and a signed webhook event.</p>
        </article>
        <aside className="payment-explainer"><h2>How it reflects</h2><ol><li><span>1</span><div><strong>Order created</strong><p>DisputeShield records the merchant’s payment request and Razorpay order ID.</p></div></li><li><span>2</span><div><strong>Checkout completed</strong><p>Razorpay returns the payment fields; the server verifies their signature.</p></div></li><li><span>3</span><div><strong>Webhook confirms capture</strong><p>A signed `payment.captured` event updates the intake record and Razorpay metrics.</p></div></li></ol><div className="webhook-callout"><CheckCircle2 size={16} /> No capture, refund, or dispute state is inferred from a browser callback alone.</div></aside>
      </section>
      <section className="intake-ledger"><div className="ledger-head"><div><div className="eyebrow">Payment intake ledger</div><h2>Recent merchant-controlled requests</h2></div><Button variant="outline" onClick={() => intakes.refetch()} disabled={intakes.isFetching}><RefreshCw size={15} /> Refresh</Button></div>{!isAuthenticated ? <div className="intake-empty"><LockKeyhole size={19} /><p>Sign in to create and view merchant payment intake records.</p><Button onClick={startLogin}>Sign in</Button></div> : intakes.data?.length ? <div className="intake-table"><div className="intake-row intake-label"><span>Receipt</span><span>Amount</span><span>Purpose</span><span>Status</span><span>Razorpay reference</span></div>{intakes.data.map(record => { const apiCaptured = record.razorpayObservedCaptured; const displayStatus = apiCaptured ? "razorpay captured" : statusLabel(record.status); return <div className="intake-row" key={record.id}><span className="mono">{record.receipt}</span><strong>{money(record.amountPaise)}</strong><span>{record.purpose === "merchant_payment" ? "Payment collection" : "Evidence intake"}</span><span className={`intake-status ${apiCaptured ? "captured" : record.status}`}>{displayStatus}{apiCaptured && record.status !== "captured" ? <small className="webhook-pending">API observed · webhook pending</small> : null}</span><span className="mono">{record.razorpayPaymentId ?? record.razorpayOrderId}</span></div>; })}</div> : <div className="intake-empty"><WalletCards size={20} /><p>No merchant payment requests yet. A created order will appear here before checkout opens.</p></div>}</section>
    </main>
  </div></MerchantWorkspaceShell>;
}
