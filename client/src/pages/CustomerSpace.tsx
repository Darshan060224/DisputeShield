import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { buildCustomerReturnTimeline } from "@/lib/customerReturnTimeline";
import { Button } from "@/components/ui/button";
import MerchantWorkspaceShell from "@/components/MerchantWorkspaceShell";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BadgeCheck, Bot, CheckCircle2, ClipboardCheck, FileSearch, FileUp, LockKeyhole, PackageCheck, ShieldAlert, ShieldCheck, ShoppingBag, Truck, UploadCloud, UserRoundCheck, WalletCards } from "lucide-react";

const documentKinds = [
  ["delivery_or_tracking", "Delivery or tracking evidence"],
  ["item_condition", "Item condition"],
  ["return_shipping_receipt", "Return shipping receipt"],
  ["payment_confirmation", "Payment confirmation"],
  ["support_conversation", "Support conversation"],
  ["other", "Other supporting document"],
] as const;

const display = (value: string) => value.replaceAll("_", " ");
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

type CheckoutResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

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

function parseJsonArray(value: string | null | undefined) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

function CustomerCatalogPanel({ catalogContext, catalogToken, setCatalogToken, redeemCatalogAccess, catalogQuantity, setCatalogQuantity, buyCatalogProduct, createCustomerCheckout, openBuyerOrder, openCustomerOrderFromCatalog }: any) {
  return <section className="customer-catalog-card"><div className="customer-catalog-heading"><div><div className="step-mark">01</div><div><span>Private local catalog</span><h2>Browse a merchant’s products and choose to pay</h2><p>The merchant shares a catalog token for one customer. Browsing does not create an order. A Razorpay Checkout opens only after you choose a product and explicitly select <b>Buy with Razorpay</b>.</p></div></div><div className="customer-catalog-boundary"><ShoppingBag size={16} /> Local merchant catalog · no payment on browse</div></div>{!catalogContext.data ? <><div className="token-row"><input value={catalogToken} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCatalogToken(event.target.value)} placeholder="Paste private catalog token" autoComplete="off" spellCheck={false} /><Button onClick={redeemCatalogAccess} disabled={catalogContext.isFetching}><ShoppingBag size={15} /> {catalogContext.isFetching ? "Opening catalog…" : "Open catalog"}</Button></div>{catalogContext.isError && <div className="customer-error"><ShieldAlert size={16} /> {catalogContext.error.message}</div>}<div className="access-boundary"><BadgeCheck size={15} /><span><b>Customer safety:</b> the catalog token only reveals active local products from one merchant and binds to your signed-in identity. It never exposes other customer orders or documents.</span></div></> : <><div className="customer-catalog-toolbar"><span><WalletCards size={15} /> Catalog access expires {new Date(catalogContext.data.accessBinding.expiresAt).toLocaleDateString()}</span><label>Quantity<select value={catalogQuantity} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setCatalogQuantity(Number(event.target.value))}>{[1,2,3,4,5,6,7,8,9,10].map(quantity => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label></div>{catalogContext.data.catalog.length ? <div className="customer-product-grid">{catalogContext.data.catalog.map((product: any) => <article key={product.id}><span className="catalog-source">MERCHANT RECORD</span><div className="customer-product-icon"><ShoppingBag size={19} /></div><h3>{product.name}</h3><p>{product.description || "Merchant description not provided."}</p><small>SKU {product.sku} · {product.inventoryQuantity} local units shown available</small><div><strong>{rupees(product.unitAmountPaise)}</strong><Button onClick={() => buyCatalogProduct(product.id)} disabled={createCustomerCheckout.isPending || product.inventoryQuantity < catalogQuantity}><WalletCards size={14} /> {createCustomerCheckout.isPending ? "Preparing…" : "Buy with Razorpay"}</Button></div></article>)}</div> : <div className="customer-empty compact"><ShoppingBag size={22} /><p>This private catalog has no active local products available today.</p></div>}{catalogContext.data.buyerOrders.length > 0 && <div className="customer-prior-orders"><div><b>Your buyer-bound local orders</b><small>Open only your own order to use the issue, return, and evidence workflow.</small></div>{catalogContext.data.buyerOrders.map((order: any) => <button key={order.id} onClick={() => openBuyerOrder(order.id)} disabled={openCustomerOrderFromCatalog.isPending}><span><b>{order.orderReference}</b><small>{order.productName} × {order.quantity} · {rupees(order.totalAmountPaise)} · {display(order.paymentObservation)}</small></span><ArrowRight size={15} /></button>)}</div>}<div className="customer-no-auto"><ShieldAlert size={16} /><span><b>Checkout boundary:</b> A browser checkout confirmation only marks this buyer order client-confirmed after server signature verification. Capture and fulfilment stay separate Razorpay/API or merchant-record facts.</span></div></>}</section>;
}

function BuyerOrderCentre({ catalogContext, openBuyerOrder, openCustomerOrderFromCatalog }: any) {
  const orders = catalogContext.data?.buyerOrders ?? [];
  if (!catalogContext.data) return null;
  const paymentLabel = (state: string) => state === "webhook_verified" ? "Signed capture confirmed" : state === "api_observed" ? "Razorpay API observed" : state === "client_confirmed" ? "Checkout signature verified" : state === "checkout_opened" ? "Checkout opened" : state === "failed" ? "Checkout failed" : "Payment not confirmed";
  return <section className="buyer-order-centre"><div className="buyer-order-centre-head"><div><div className="hero-kicker"><PackageCheck size={14} /> My private order centre</div><h2>Track each order from checkout to resolution</h2><p>Only orders bound to your signed-in buyer identity appear here. Payment, fulfilment, returns, and customer cases remain separate source-labelled facts.</p></div><span>{orders.length} order{orders.length === 1 ? "" : "s"}</span></div>{orders.length ? <div className="buyer-order-grid">{orders.map((order: any) => { const resolution = order.localResolution; return <article key={order.id}><div className="buyer-order-title"><div><b>{order.productName}</b><small>{order.orderReference} · {rupees(order.totalAmountPaise)}</small></div><button onClick={() => openBuyerOrder(order.id)} disabled={openCustomerOrderFromCatalog.isPending}>Open resolution centre <ArrowRight size={14} /></button></div><div className="buyer-order-track"><span className={order.paymentObservation === "webhook_verified" || order.paymentObservation === "api_observed" ? "confirmed" : ""}><i>01</i><b>Checkout</b><small>{paymentLabel(order.paymentObservation)}</small></span><span className={order.fulfillmentState === "delivered" ? "confirmed" : order.fulfillmentState === "delivery_exception" ? "attention" : ""}><i>02</i><b>Delivery</b><small>{display(order.fulfillmentState)} · merchant record</small></span><span className={resolution ? "attention" : ""}><i>03</i><b>Return / issue</b><small>{resolution ? `${display(resolution.issueType)} · ${display(resolution.status)} · local customer case` : "No local issue opened"}</small></span></div><div className="buyer-order-boundary"><ShieldAlert size={14} /><span>Opening this order lets you submit a local issue, return request, or evidence. It does not create a Razorpay dispute, payment, or refund.</span></div></article>; })}</div> : <div className="buyer-order-empty"><PackageCheck size={20} /><span>Browse the private catalog and use an explicit Checkout action when you are ready. Browsing alone creates no order.</span></div>}</section>;
}

function CustomerReturnTruth({ caseItem }: { caseItem: any }) {
  if (!["return_request", "damaged_or_wrong_item"].includes(caseItem.issueType) && !caseItem.returnReceipt && !caseItem.refundRequest) return null;
  const refundStatus = caseItem.refundRequest?.status;
  const refundMessage = refundStatus === "razorpay_confirmed" ? "Razorpay confirmed the refund through a signed webhook." : refundStatus === "merchant_approved" ? "Merchant approval is recorded. Razorpay refund confirmation is still pending." : refundStatus === "prepared" ? "A local refund request is prepared; merchant approval is still required." : caseItem.returnReceipt ? "Return receipt is recorded. The merchant may now assess refund readiness." : "No return receipt is recorded yet.";
  const timelineFacts = buildCustomerReturnTimeline(caseItem);
  return <section className="customer-return-truth"><div><div className="hero-kicker"><Truck size={14} /> Return and refund truth layer</div><h2>What is confirmed for this return</h2><p>These facts are separate from a real Razorpay dispute and protect you from a refund being promised before it is confirmed.</p></div><div className="customer-return-truth-grid"><article><span>Return dispatch</span><b>{caseItem.status === "return_in_transit" || caseItem.status === "return_received" ? "Customer marked in transit" : "Not in transit"}</b><small>Customer local case event</small></article><article><span>Merchant receipt</span><b>{caseItem.returnReceipt ? "Recorded" : "Pending"}</b><small>{caseItem.returnReceipt ? `${caseItem.returnReceipt.carrierName} · ${caseItem.returnReceipt.trackingReference} · ${display(caseItem.returnReceipt.sourceKind)}` : "No carrier or merchant receipt has been recorded"}</small></article><article><span>Local refund request</span><b>{refundStatus ? display(refundStatus) : "Not prepared"}</b><small>{refundMessage}</small></article></div><div className="customer-timeline customer-return-timeline"><span>Return and refund timeline facts</span>{timelineFacts.length ? timelineFacts.map(fact => <div key={fact.key}><i className={fact.key === "refund_confirmed" ? "system" : "merchant"} /><p><b>{fact.title}</b>{fact.detail}</p><small>{fact.source}{fact.at ? ` · ${new Date(fact.at).toLocaleString()}` : ""}</small></div>) : <div><i className="system" /><p><b>No return or refund record</b>Return and refund events will appear here when independently recorded.</p><small>Local customer case</small></div>}</div><div className={`customer-return-truth-note ${refundStatus === "razorpay_confirmed" ? "confirmed" : ""}`}><ShieldCheck size={16} /><span>{refundStatus === "razorpay_confirmed" ? "Verified external fact: Razorpay refund confirmation is present." : "No money-moved claim: only a signed Razorpay refund.processed event can mark a local request as externally confirmed."}</span></div></section>;
}

function CustomerResolutionGuide({ caseItem }: { caseItem: any }) {
  const recommendation = caseItem.recommendation;
  if (!recommendation) return null;
  return <section className="customer-resolution-guide"><div className="customer-resolution-guide-head"><div><div className="hero-kicker"><FileSearch size={14} /> Explainable resolution guide</div><h2>What this case needs next</h2><p>{recommendation.rationale}</p></div><span className={`resolution-readiness ${recommendation.readiness}`}>{display(recommendation.readiness)}</span></div><div className="customer-resolution-grid"><article><span>Evidence gaps</span>{recommendation.missingEvidence.length ? <ul>{recommendation.missingEvidence.map((item: string) => <li key={item}>{display(item)}</li>)}</ul> : <p>None identified by the current local policy.</p>}</article><article><span>Preparation steps</span><ol>{recommendation.nextActions.map((item: string, index: number) => <li key={`${item}-${index}`}>{item}</li>)}</ol></article></div><div className="customer-resolution-block"><ShieldAlert size={16} /><div><b>Always blocked</b><span>{recommendation.blockedActions.join(" · ")}</span></div></div></section>;
}

function CustomerStatementSignal({ caseItem, analysis, pending, onAnalyze }: { caseItem: any; analysis: any; pending: boolean; onAnalyze: () => void }) {
  const current = analysis?.caseReference === caseItem.caseReference ? analysis.analysis : null;
  const available = current?.status === "model_response_validated";
  return <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="hero-kicker"><Bot size={14} /> Local Ollama language triage</div><h2 className="mt-1 text-lg font-semibold text-slate-950">Customer statement signal</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Optional analysis of the statement already stored in this local case. It classifies expressed tone only; it does not judge whether the statement is true or decide what happens next.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${available ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-950"}`}>{available ? "LOCAL MODEL · VALIDATED" : current ? "NO MODEL SIGNAL" : "NOT RUN"}</span></div>{current ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><article className="rounded-lg bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tone</span><b className="mt-1 block capitalize text-slate-950">{current.sentimentLabel.replaceAll("_", " ")}</b></article><article className="rounded-lg bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Confidence</span><b className="mt-1 block text-slate-950">{current.confidencePercent === null ? "Unavailable" : `${current.confidencePercent}%`}</b></article><article className="rounded-lg bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Source</span><b className="mt-1 block text-slate-950">Customer statement</b></article><p className="sm:col-span-3 rounded-lg border border-sky-100 bg-white p-3 text-xs leading-5 text-slate-700"><b>{current.mode === "ollama_local" ? current.model : "Local Ollama unavailable"}</b> · {current.rationale}</p></div> : <p className="mt-4 rounded-lg border border-dashed border-sky-200 bg-white/80 p-3 text-sm text-slate-600">No language signal has been requested. Evidence, OCR confirmation, and the case timeline remain unchanged.</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-3xl text-xs leading-5 text-slate-600">{current?.boundary ?? "Language triage hint only. It cannot label fraud or manipulation, deny a case, block a customer, change payment/refund state, or submit an external action."}</p><Button size="sm" variant="outline" onClick={onAnalyze} disabled={pending}><Bot className="mr-2 h-4 w-4" />{pending ? "Checking local model…" : current ? "Recheck local statement" : "Analyze local statement"}</Button></div></section>;
}

export default function CustomerSpace() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [accessToken, setAccessToken] = useState("");
  const [redeemedToken, setRedeemedToken] = useState("");
  const [catalogToken, setCatalogToken] = useState("");
  const [redeemedCatalogToken, setRedeemedCatalogToken] = useState("");
  const [catalogQuantity, setCatalogQuantity] = useState(1);
  const [issueType, setIssueType] = useState("product_not_received");
  const [statement, setStatement] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [selectedCaseReference, setSelectedCaseReference] = useState<string | null>(null);
  const [documentKind, setDocumentKind] = useState<(typeof documentKinds)[number][0]>("delivery_or_tracking");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useGeminiAssistance, setUseGeminiAssistance] = useState(false);
  const [bankGuidanceOpen, setBankGuidanceOpen] = useState(false);

  const orderContext = trpc.customerOrderContext.useQuery({ accessToken: redeemedToken }, { enabled: isAuthenticated && redeemedToken.length >= 32, retry: false, refetchOnWindowFocus: false });
  const catalogContext = trpc.customerCatalogContext.useQuery({ catalogToken: redeemedCatalogToken }, { enabled: isAuthenticated && redeemedCatalogToken.length >= 32, retry: false, refetchOnWindowFocus: false });
  const cases = trpc.customerCases.useQuery({ accessToken: redeemedToken }, { enabled: Boolean(orderContext.data), retry: false, refetchOnWindowFocus: true });
  const createCase = trpc.createCustomerCase.useMutation();
  const uploadDocument = trpc.uploadCustomerCaseDocument.useMutation();
  const confirmExtraction = trpc.confirmCustomerDocumentExtraction.useMutation();
  const customerAction = trpc.customerCaseAction.useMutation();
  const createCustomerCheckout = trpc.createCustomerCheckout.useMutation();
  const markCustomerCheckoutOpened = trpc.markCustomerCheckoutOpened.useMutation();
  const verifyCustomerCheckout = trpc.verifyCustomerCheckout.useMutation();
  const openCustomerOrderFromCatalog = trpc.openCustomerOrderFromCatalog.useMutation();
  const createSyntheticValidationOrder = trpc.createSyntheticCustomerValidationOrder.useMutation();
  const analyzeCaseSentiment = trpc.analyzeCustomerCaseSentiment.useMutation();
  const [statementAnalysis, setStatementAnalysis] = useState<any>(null);

  const selectedCase = useMemo(() => cases.data?.find(caseItem => caseItem.caseReference === selectedCaseReference) ?? cases.data?.[0] ?? null, [cases.data, selectedCaseReference]);
  const selectedGuidance = orderContext.data?.issueGuidance.find(item => item.issueType === issueType);

  function redeemOrderAccess() {
    if (!isAuthenticated) { startLogin(); return; }
    if (accessToken.trim().length < 32) { toast.error("Enter the complete customer access token supplied for this order."); return; }
    setRedeemedToken(accessToken.trim());
  }

  function redeemCatalogAccess() {
    if (!isAuthenticated) { startLogin(); return; }
    if (catalogToken.trim().length < 32) { toast.error("Enter the complete private catalog token supplied by the merchant."); return; }
    setRedeemedCatalogToken(catalogToken.trim());
  }

  async function launchCustomerCheckout(order: { orderId: string; amountPaise: number; currency: string; keyId?: string; productName: string; quantity: number }) {
    if (!order.keyId) { toast.error("The merchant's Razorpay public key is unavailable. Checkout was not opened."); return; }
    const ready = await loadRazorpayCheckout();
    if (!ready || !window.Razorpay) { toast.error("Razorpay Checkout could not be loaded. No payment was started."); return; }
    markCustomerCheckoutOpened.mutate({ orderId: order.orderId });
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "Customer Space",
      description: `${order.productName} × ${order.quantity}`,
      order_id: order.orderId,
      handler: (response: CheckoutResponse) => verifyCustomerCheckout.mutate({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }, { onSuccess: result => { setRedeemedToken(result.orderAccessToken); toast.success("Checkout signature verified", { description: "Your order is available for the local issue workflow. Final capture remains a separate Razorpay API or signed-webhook fact." }); }, onError: error => toast.error(error.message) }),
      modal: { ondismiss: () => { toast.message("Checkout closed. No payment was treated as captured."); void catalogContext.refetch(); } },
      theme: { color: "#278f80" },
    });
    checkout.open();
  }

  function buyCatalogProduct(productId: number) {
    if (!redeemedCatalogToken) return;
    if (!Number.isInteger(catalogQuantity) || catalogQuantity < 1 || catalogQuantity > 10) { toast.error("Choose a quantity between 1 and 10."); return; }
    createCustomerCheckout.mutate({ catalogToken: redeemedCatalogToken, productId, quantity: catalogQuantity }, { onSuccess: launchCustomerCheckout, onError: error => toast.error(error.message) });
  }

  function openBuyerOrder(sellerOrderId: number) {
    if (!redeemedCatalogToken) return;
    openCustomerOrderFromCatalog.mutate({ catalogToken: redeemedCatalogToken, sellerOrderId }, { onSuccess: result => { setRedeemedToken(result.accessToken); toast.success("Buyer order opened", { description: "This access is bound to your signed-in identity and limited to the selected order." }); }, onError: error => toast.error(error.message) });
  }

  function refreshCases() {
    if (redeemedToken) { void cases.refetch(); }
  }

  function startSyntheticValidationFixture() {
    createSyntheticValidationOrder.mutate({ acknowledgement: "SYNTHETIC_LOCAL_VALIDATION_ONLY" }, { onSuccess: result => {
      setAccessToken(result.accessToken);
      setRedeemedToken(result.accessToken);
      setIssueType("return_request");
      setStatement("SYNTHETIC LOCAL VALIDATION ONLY — this is not a customer claim and must not trigger any payment, refund, carrier, or external dispute action.");
      setReturnReason("Synthetic protected workflow validation");
      toast.success("Synthetic local order opened", { description: "Use the normal protected case, document, OCR-confirmation, and submission controls. No payment was created." });
    }, onError: error => toast.error(error.message) });
  }

  function submitCaseDraft() {
    if (!redeemedToken) return;
    if (statement.trim().length < 12) { toast.error("Describe the issue with at least 12 characters so the merchant can review factual context."); return; }
    if (["return_request", "damaged_or_wrong_item"].includes(issueType) && returnReason.trim().length < 3) { toast.error("Add a return or item-condition reason before creating this case."); return; }
    createCase.mutate({ accessToken: redeemedToken, issueType: issueType as any, customerStatement: statement.trim(), returnReason: ["return_request", "damaged_or_wrong_item"].includes(issueType) ? returnReason.trim() : undefined }, {
      onSuccess: result => { toast.success("Local customer case drafted", { description: "Add evidence, review OCR candidate facts, then submit it to the merchant. No refund or external dispute was created." }); setSelectedCaseReference(result.caseReference); setStatement(""); setReturnReason(""); refreshCases(); },
      onError: error => toast.error(error.message),
    });
  }

  function uploadSelectedDocument() {
    if (!selectedCase || !selectedFile || !redeemedToken) { toast.error("Choose a case and a supporting document first."); return; }
    if (selectedFile.size > 3_500_000) { toast.error("The selected document exceeds the 3.5 MB Customer Space limit."); return; }
    const permitted = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!permitted.includes(selectedFile.type)) { toast.error("Upload a JPEG, PNG, WebP, or PDF document."); return; }
    const reader = new FileReader();
    reader.onerror = () => toast.error("This document could not be read in the browser.");
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const contentBase64 = result.includes(",") ? result.split(",")[1] : "";
      if (!contentBase64) { toast.error("This document did not contain uploadable data."); return; }
      uploadDocument.mutate({ accessToken: redeemedToken, caseReference: selectedCase.caseReference, declaredKind: documentKind, originalName: selectedFile.name, contentType: selectedFile.type as any, contentBase64, useGeminiAssistance }, {
        onSuccess: result => { toast.success("Evidence retained", { description: result.extraction ? `AI (GPT-5-6 Luna) extracted candidate facts at ${result.extraction.overallConfidence}% confidence. Confirm or correct them below.` : useGeminiAssistance ? "The original document is available for direct merchant review because AI assistance did not complete." : "The original document is available for direct merchant review; AI assistance was not requested." }); setSelectedFile(null); refreshCases(); },
        onError: error => toast.error(error.message),
      });
    };
    reader.readAsDataURL(selectedFile);
  }

  function confirmDocument(documentId: number, confirmation: "confirmed" | "corrected" | "rejected") {
    if (!redeemedToken) return;
    confirmExtraction.mutate({ accessToken: redeemedToken, documentId, confirmation }, { onSuccess: () => { toast.success(confirmation === "confirmed" ? "OCR candidate facts confirmed" : confirmation === "rejected" ? "OCR candidate facts rejected" : "OCR candidate facts marked for correction", { description: "The original document remains unchanged and the merchant must still review it." }); refreshCases(); }, onError: error => toast.error(error.message) });
  }

  function runCustomerAction(action: "submit" | "withdraw" | "provide_evidence" | "mark_return_in_transit" | "accept_resolution", note?: string) {
    if (!selectedCase || !redeemedToken) return;
    customerAction.mutate({ accessToken: redeemedToken, caseReference: selectedCase.caseReference, action, note }, { onSuccess: result => { toast.success("Case status updated", { description: result.message }); refreshCases(); }, onError: error => toast.error(error.message) });
  }

  return <MerchantWorkspaceShell><div className="customer-space-page">
    <header className="merchant-topbar"><div className="brand-mark"><span className="brand-slash">◢</span><span>DisputeShield</span></div><nav className="top-links"><Link href="/">Merchant home</Link><Link href="/payments">Payments</Link><Link href="/seller-space">Seller Space</Link><strong>Customer Space</strong></nav><div className="top-actions"><span className="secure-flag">Evidence-safe case intake</span><button className="avatar">{user?.name?.slice(0, 2).toUpperCase() ?? "CU"}</button></div></header>
    <main className="customer-space-main">
      <Link href="/" className="back-link"><ArrowLeft size={15} /> Back to merchant operations</Link>
      <section className="customer-hero"><div className="customer-hero-orbit" /><div><div className="hero-kicker"><UserRoundCheck size={14} /> Customer issue and return space</div><h1>Tell the truth.<br /><em>Track the resolution.</em></h1><p>Open a local issue for your bound order, add supporting documents, review OCR candidate facts, and follow the merchant’s human-controlled resolution path.</p></div><aside><ShieldCheck size={18} /><strong>Bounded by design</strong><p>Customer cases, documents and OCR are local evidence records. They do not create a Razorpay dispute, return label, refund, or payment action.</p></aside></section>
      {isAuthenticated && user?.role === "admin" && !orderContext.data && <section className="customer-no-auto"><ShieldAlert size={16} /><div><b>Owner-only synthetic validation fixture</b><span>Creates one clearly labelled local order for protected Customer Space testing. It has no payment, carrier, return, refund, or external-dispute state.</span></div><Button variant="outline" onClick={startSyntheticValidationFixture} disabled={createSyntheticValidationOrder.isPending}>{createSyntheticValidationOrder.isPending ? "Opening fixture…" : "Open synthetic local fixture"}</Button></section>}
      {isAuthenticated && !orderContext.data && <CustomerCatalogPanel catalogContext={catalogContext} catalogToken={catalogToken} setCatalogToken={setCatalogToken} redeemCatalogAccess={redeemCatalogAccess} catalogQuantity={catalogQuantity} setCatalogQuantity={setCatalogQuantity} buyCatalogProduct={buyCatalogProduct} createCustomerCheckout={createCustomerCheckout} openBuyerOrder={openBuyerOrder} openCustomerOrderFromCatalog={openCustomerOrderFromCatalog} />}
      {isAuthenticated && !orderContext.data && <BuyerOrderCentre catalogContext={catalogContext} openBuyerOrder={openBuyerOrder} openCustomerOrderFromCatalog={openCustomerOrderFromCatalog} />}
      {!isAuthenticated ? <section className="customer-lock"><LockKeyhole size={24} /><div><span>Customer authentication required</span><h2>Sign in before accessing an order.</h2><p>An order reference alone never reveals customer, merchant, fulfilment, payment, or document data.</p></div><Button onClick={startLogin}>Sign in to Customer Space <ArrowRight size={15} /></Button></section> : !orderContext.data ? <section className="customer-access-card"><div className="customer-access-head"><div className="step-mark">01</div><div><span>Private order access</span><h2>Redeem the one-time order access token</h2><p>The merchant shares this high-entropy token for a specific order. It binds to the first signed-in customer who redeems it and expires automatically.</p></div></div><div className="token-row"><input value={accessToken} onChange={event => setAccessToken(event.target.value)} placeholder="Paste order access token" autoComplete="off" spellCheck={false} /><Button onClick={redeemOrderAccess} disabled={orderContext.isFetching}><LockKeyhole size={15} /> {orderContext.isFetching ? "Checking access…" : "Open my order"}</Button></div>{orderContext.isError && <div className="customer-error"><ShieldAlert size={16} /> {orderContext.error.message}</div>}<div className="access-boundary"><BadgeCheck size={15} /><span><b>Privacy boundary:</b> never paste a token into public chat or share it after redemption. This space does not permit browsing orders.</span></div></section> : <>
        <section className="customer-order-strip"><div><span>Bound order</span><h2>{orderContext.data.order.orderReference}</h2><p>{orderContext.data.order.productName} × {orderContext.data.order.quantity} · {rupees(orderContext.data.order.totalAmountPaise)}</p></div><div><span>Payment observation</span><b>{display(orderContext.data.order.paymentObservation)}</b><small>Not inferred from a browser callback</small></div><div><span>Fulfilment record</span><b>{display(orderContext.data.order.fulfillmentState)}</b><small>Merchant record; not customer proof</small></div><div><span>Access expires</span><b>{new Date(orderContext.data.accessBinding.expiresAt).toLocaleDateString()}</b><small>Bound to this signed-in customer</small></div></section>
        <section className="customer-workflow-rail"><span className="active"><b>01</b> Describe issue</span><ArrowRight size={14} /><span><b>02</b> Add evidence</span><ArrowRight size={14} /><span><b>03</b> Confirm OCR</span><ArrowRight size={14} /><span><b>04</b> Merchant review</span><ArrowRight size={14} /><span><b>05</b> Resolution</span></section>
        <section className="customer-grid">
          <article className="customer-card issue-intake-card"><div className="customer-card-head"><div className="step-mark">02</div><div><span>Issue intake</span><h2>Open a factual local case</h2><p>Select the issue that best matches the order. Your requested outcome cannot override merchant evidence checks or trigger a financial action.</p></div></div><div className="issue-options">{orderContext.data.issueGuidance.map(item => <button key={item.issueType} onClick={() => setIssueType(item.issueType)} className={issueType === item.issueType ? "selected" : ""}><b>{item.label}</b><small>{item.issueType === "product_not_received" ? "Primary workflow" : "Local policy path"}</small></button>)}</div><div className="issue-context"><FileSearch size={16} /><div><b>{selectedGuidance?.label}</b><p>{selectedGuidance?.description}</p><small>Suggested evidence: {selectedGuidance?.evidence.join(" · ")}</small></div></div><label>What happened?<textarea value={statement} onChange={event => setStatement(event.target.value)} maxLength={2000} placeholder="Describe only the facts you know about this order." /></label>{["return_request", "damaged_or_wrong_item"].includes(issueType) && <label>{issueType === "damaged_or_wrong_item" ? "Item-condition reason" : "Return reason"}<input value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder={issueType === "damaged_or_wrong_item" ? "e.g. received a damaged or incorrect item" : "e.g. item arrived damaged"} maxLength={160} /></label>}<div className="customer-action-note"><ShieldAlert size={15} /><span>{selectedGuidance?.merchantOnly}</span></div><Button onClick={submitCaseDraft} disabled={createCase.isPending}>{createCase.isPending ? "Creating local case…" : "Create case draft"} <ArrowRight size={15} /></Button></article>
          <aside className="customer-card case-list-card"><div className="customer-card-head"><div className="step-mark">03</div><div><span>My local cases</span><h2>Case status</h2><p>Each case remains separate from a real Razorpay dispute.</p></div></div>{cases.isLoading ? <div className="customer-empty">Loading bound cases…</div> : cases.data?.length ? <div className="customer-case-list">{cases.data.map(caseItem => <button key={caseItem.caseReference} onClick={() => setSelectedCaseReference(caseItem.caseReference)} className={selectedCase?.caseReference === caseItem.caseReference ? "selected" : ""}><span><b>{caseItem.guidance.label}</b><small>{caseItem.caseReference} · {caseItem.documents.length} document{caseItem.documents.length === 1 ? "" : "s"}</small></span><em className={`customer-status ${caseItem.status}`}>{display(caseItem.status)}</em></button>)}</div> : <div className="customer-empty"><ClipboardCheck size={24} /><b>No local issue has been opened</b><p>Describe the order issue first, then add real supporting evidence.</p></div>}</aside>
        </section>
        {selectedCase && <CustomerResolutionGuide caseItem={selectedCase} />}
        {selectedCase && <CustomerStatementSignal caseItem={selectedCase} analysis={statementAnalysis} pending={analyzeCaseSentiment.isPending} onAnalyze={() => analyzeCaseSentiment.mutate({ accessToken: redeemedToken, caseReference: selectedCase.caseReference }, { onSuccess: setStatementAnalysis, onError: error => toast.error(error.message) })} />}
        {selectedCase && <CustomerReturnTruth caseItem={selectedCase} />}
        {selectedCase && <section className="gemini-consent-card"><div><div className="hero-kicker"><FileSearch size={14} /> Local document processing and optional AI assistance (GPT-5-6 Luna)</div><h2>You control how supporting evidence is processed</h2><p>By selecting a document, you confirm that it is relevant to this local case and consent to its protected processing for case review. If enabled, the selected document is sent from the server to AI (GPT-5-6 Luna) only to extract candidate facts for this local case. AI cannot decide the case, issue a refund, submit a dispute, or replace your confirmation and merchant review.</p></div><label><input type="checkbox" checked={useGeminiAssistance} onChange={event => setUseGeminiAssistance(event.target.checked)} /><span><b>Use AI (GPT-5-6 Luna) to produce candidate facts for the document I choose</b><small>Leave unchecked to retain the original document for direct merchant review only.</small></span></label></section>}
        {selectedCase && <section className="customer-case-detail"><div className="customer-case-heading"><div><div className="hero-kicker"><PackageCheck size={14} /> Local customer case · not submitted to Razorpay</div><h2>{selectedCase.guidance.label}</h2><p>{selectedCase.caseReference} · {display(selectedCase.status)} · created {new Date(selectedCase.createdAt).toLocaleString()}</p></div><div className="customer-source-lock"><LockKeyhole size={15} /> Original documents stay immutable</div></div><div className="customer-case-columns"><article className="customer-doc-panel"><div className="panel-top"><div><span>Evidence vault</span><h3>Attach supporting documents</h3><p>JPEG, PNG, WebP or PDF only. Maximum 3.5 MB. OCR output is a candidate, not proof.</p></div><FileUp size={22} /></div><div className="document-upload-form"><select value={documentKind} onChange={event => setDocumentKind(event.target.value as typeof documentKind)}>{documentKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="file-picker"><UploadCloud size={17} /><span>{selectedFile ? selectedFile.name : "Choose a document"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setSelectedFile(event.target.files?.[0] ?? null)} /></label><Button onClick={uploadSelectedDocument} disabled={!selectedFile || uploadDocument.isPending}>{uploadDocument.isPending ? "Retaining & extracting…" : "Add protected evidence"}</Button></div><div className="customer-doc-list">{selectedCase.documents.length ? selectedCase.documents.map(document => { const fields = parseJsonArray(document.extraction?.fieldsJson); const warnings = parseJsonArray(document.extraction?.warningsJson); return <article className="customer-document" key={document.id}><div className="document-title"><FileSearch size={17} /><div><b>{document.originalName}</b><small>{display(document.declaredKind)} · {(document.byteSize / 1024).toFixed(0)} KB · original retained</small></div><span className={`ocr-state ${document.extraction?.status ?? "pending"}`}>{document.extraction?.status === "complete" ? "OCR candidate" : document.extraction?.status === "failed" ? "Human review" : "Queued"}</span></div>{document.extraction?.status === "complete" && <div className="ocr-result"><div><span>Extraction confidence</span><b>{document.extraction.overallConfidence}%</b></div><p>{document.extraction.summary}</p>{fields.length > 0 && <div className="ocr-fields">{fields.map((field: any, index: number) => <span key={`${field.key}-${index}`} className={field.relation}><b>{field.key}</b>{field.value} · {field.confidence}%</span>)}</div>}{warnings.length > 0 && <div className="ocr-warnings">{warnings.map((warning: string, index: number) => <span key={`${warning}-${index}`}><ShieldAlert size={13} /> {warning}</span>)}</div>}{document.extraction.customerConfirmation === "not_reviewed" ? <div className="ocr-confirm"><b>Is this OCR output accurate enough to share as a candidate?</b><Button size="sm" onClick={() => confirmDocument(document.id, "confirmed")} disabled={confirmExtraction.isPending}><CheckCircle2 size={13} /> Confirm</Button><Button size="sm" variant="outline" onClick={() => confirmDocument(document.id, "rejected")} disabled={confirmExtraction.isPending}>Reject · human review</Button></div> : <div className="ocr-confirmed"><BadgeCheck size={15} /> Customer {display(document.extraction.customerConfirmation)}</div>}</div>}{document.extraction?.status === "failed" && <div className="ocr-unavailable"><ShieldAlert size={14} /> OCR was unavailable. The original document remains queued for direct merchant review.</div>}</article>; }) : <div className="customer-empty compact"><UploadCloud size={22} /><p>Add truthful supporting evidence before submission. OCR cannot create facts that are not present in a document.</p></div>}</div></article><aside className="customer-status-panel"><div className="panel-top"><div><span>Resolution control</span><h3>What happens next</h3><p>Customer actions are limited to your local case. The merchant controls verification and any separate financial action.</p></div><ShieldCheck size={22} /></div><div className="customer-state-explainer"><span>Current state</span><strong>{display(selectedCase.status)}</strong><p>{selectedCase.status === "draft" ? "Add evidence, review OCR candidate output, then submit to the merchant." : selectedCase.status === "evidence_pending" ? "A document or OCR review is still required before submission." : selectedCase.status === "submitted" ? "The case is waiting for the merchant to begin a factual review." : selectedCase.status === "customer_action_required" ? "The merchant requested a specific clarification or document." : selectedCase.status === "return_authorized" ? "The merchant has recorded local return instructions. Add your own shipment proof when dispatched." : selectedCase.status === "resolution_offered" ? "A local merchant resolution offer is recorded. Accepting it does not execute a refund in this application." : "This status is retained in the local case timeline."}</p></div><div className="customer-case-actions">{["draft", "evidence_pending"].includes(selectedCase.status) && <Button onClick={() => runCustomerAction("submit")} disabled={customerAction.isPending}><ClipboardCheck size={15} /> Submit for merchant review</Button>}{selectedCase.status === "customer_action_required" && <Button onClick={() => runCustomerAction("provide_evidence", "Customer is providing the requested evidence.")} disabled={customerAction.isPending}><UploadCloud size={15} /> Continue evidence update</Button>}{selectedCase.status === "return_authorized" && <Button onClick={() => runCustomerAction("mark_return_in_transit", "Customer recorded that the authorized return is in transit.")} disabled={customerAction.isPending}><Truck size={15} /> Mark return in transit</Button>}{selectedCase.status === "resolution_offered" && <Button onClick={() => runCustomerAction("accept_resolution", "Customer accepted the recorded local resolution offer.")} disabled={customerAction.isPending}><CheckCircle2 size={15} /> Accept local resolution</Button>}{!["resolved", "closed", "withdrawn"].includes(selectedCase.status) && <Button variant="outline" onClick={() => runCustomerAction("withdraw", "Customer withdrew the local case.")} disabled={customerAction.isPending}>Withdraw case</Button>}</div><div className="customer-bank-guidance"><div><div className="hero-kicker"><ShieldAlert size={14} /> Bank dispute guidance</div><h3>Need to contact your bank?</h3><p>This button opens guidance for contacting the issuing bank. It does not create a Razorpay dispute, refund, webhook, chargeback, or dashboard count.</p></div><Button variant="outline" onClick={() => setBankGuidanceOpen(value => !value)}>{bankGuidanceOpen ? "Hide guidance" : "Show next steps"}</Button>{bankGuidanceOpen && <div className="customer-bank-guidance-detail"><b>Customer action outside DisputeShield</b><span>Keep your payment reference and supporting documents, then contact the bank that issued your payment method. The bank decides whether to investigate or raise a dispute through the network.</span><small>DisputeShield will show an external dispute only after Razorpay provides a verified API observation or signed webhook event.</small></div>}</div><div className="customer-timeline"><span>Case timeline</span>{selectedCase.events.slice().reverse().map(event => <div key={event.id}><i className={event.actorType} /><p><b>{display(event.eventType)}</b>{event.detail}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.actorType}</small></div>)}</div><div className="customer-no-auto"><ShieldAlert size={16} /><span><b>Always manual:</b> Refunds, return labels, Razorpay disputes, chargebacks, and external appeals are not performed by this Customer Space workflow.</span></div></aside></div></section>}
      </>}
    </main>
  </div></MerchantWorkspaceShell>;
}
