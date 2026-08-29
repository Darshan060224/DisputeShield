import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { sellerWorkspaceDisplayState } from "@shared/sellerWorkspaceState";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Activity, ArrowLeft, ArrowRight, BadgeCheck, Boxes, CheckCircle2, ClipboardCheck, ExternalLink, FileSearch, Layers3, PackageCheck, PackagePlus, ShieldAlert, ShoppingBag, Truck, UserRoundCheck, WalletCards } from "lucide-react";

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

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const display = (value: string) => value.replaceAll("_", " ");

function sellerPaymentFact(order: { paymentObservation: string; razorpayObservationState: "no_payment_reference" | "api_observation_unavailable" | "api_not_captured" | "api_captured" }) {
  if (order.razorpayObservationState === "api_captured") return { label: "Razorpay captured", detail: "Razorpay API fact; webhook status remains independent", tone: "captured" } as const;
  if (order.razorpayObservationState === "api_observation_unavailable") return { label: "API observation unavailable", detail: "Payment lookup did not complete; no capture state is inferred", tone: "api-unavailable" } as const;
  if (order.razorpayObservationState === "api_not_captured") return { label: "Razorpay API: not captured", detail: "Razorpay API returned a non-captured payment state", tone: "api-not-captured" } as const;
  return { label: display(order.paymentObservation), detail: "No Razorpay payment reference is available for observation", tone: order.paymentObservation } as const;
}

const scenarioOptions = [
  ["product_not_received", "Product/service not received"],
  ["unauthorized_transaction", "Unauthorized transaction"],
  ["wrong_amount", "Wrong amount"],
  ["duplicate_payment", "Duplicate payment"],
  ["refund_issue", "Refund issue"],
] as const;

export default function SellerSpace() {
  const { user, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [inventory, setInventory] = useState("1");
  const [buyerLabel, setBuyerLabel] = useState("Local buyer");
  const [quantity, setQuantity] = useState("1");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [fulfillmentState, setFulfillmentState] = useState<"packed" | "shipped" | "delivered" | "delivery_exception">("packed");
  const [evidenceNote, setEvidenceNote] = useState("Merchant-recorded fulfillment milestone.");
  const [scenarioType, setScenarioType] = useState<(typeof scenarioOptions)[number][0]>("product_not_received");
  const [customerStatement, setCustomerStatement] = useState("Payment was made, but the product or service was not delivered.");
  const [requestedOutcome, setRequestedOutcome] = useState<"case_review" | "contest_response" | "customer_resolution">("case_review");
  const [customerAccess, setCustomerAccess] = useState<{ orderReference: string; accessToken: string; expiresAt: Date } | null>(null);
  const [customerCatalogAccess, setCustomerCatalogAccess] = useState<{ accessToken: string; expiresAt: Date } | null>(null);

  const sellerWorkspace = trpc.sellerSpaceContext.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: true });
  const workspaceReady = Boolean(sellerWorkspace.data);
  const workspace = sellerWorkspace.data ?? { workspaceRef: "------", productCount: 0, orderCount: 0 };
  const products = trpc.sellerProducts.useQuery(undefined, { enabled: workspaceReady, retry: false, refetchOnWindowFocus: true });
  const orders = trpc.sellerOrders.useQuery(undefined, { enabled: workspaceReady, retry: false, refetchOnWindowFocus: true, refetchInterval: 12_000 });
  const scenarios = trpc.sellerDisputeScenarios.useQuery(undefined, { enabled: workspaceReady, retry: false, refetchOnWindowFocus: true });
  const createProduct = trpc.createSellerProduct.useMutation();
  const createCheckout = trpc.createSellerCheckout.useMutation();
  const markOpened = trpc.markSellerCheckoutOpened.useMutation();
  const verifyCheckout = trpc.verifySellerCheckout.useMutation();
  const recordFulfillment = trpc.recordSellerFulfillment.useMutation();
  const createScenario = trpc.createSellerDisputeScenario.useMutation();
  const createCustomerAccess = trpc.createCustomerOrderAccess.useMutation();
  const createCustomerCatalogAccess = trpc.createCustomerCatalogAccess.useMutation();

  const requestedOrderReference = new URLSearchParams(location.split("?")[1] ?? "").get("order");
  const selectedOrder = useMemo(() => orders.data?.find(order => order.orderReference === requestedOrderReference) ?? orders.data?.find(order => order.id === selectedOrderId) ?? orders.data?.[0] ?? null, [orders.data, requestedOrderReference, selectedOrderId]);

  function refreshAll() { sellerWorkspace.refetch(); products.refetch(); orders.refetch(); scenarios.refetch(); }

  function addProduct() {
    if (!isAuthenticated) { startLogin(); return; }
    const amount = Number(price);
    const stock = Number(inventory);
    if (!sku.trim() || !name.trim() || !Number.isFinite(amount) || amount < 1 || !Number.isInteger(stock) || stock < 0) {
      toast.error("Enter a SKU, product name, price of at least ₹1, and a whole-number inventory quantity.");
      return;
    }
    createProduct.mutate({ sku: sku.trim(), name: name.trim(), description: description.trim() || undefined, unitAmountRupees: amount, inventoryQuantity: stock }, {
      onSuccess: () => { toast.success("Merchant product created", { description: "This is a local Seller Space record, not a Razorpay catalog item." }); setSku(""); setName(""); setDescription(""); setPrice(""); setInventory("1"); products.refetch(); },
      onError: error => toast.error(error.message),
    });
  }

  async function launchSellerCheckout(order: { orderId: string; amountPaise: number; currency: string; keyId?: string; productName: string; quantity: number }) {
    if (!order.keyId) { toast.error("Razorpay public key is unavailable. Checkout was not opened."); return; }
    const ready = await loadRazorpayCheckout();
    if (!ready || !window.Razorpay) { toast.error("Razorpay Checkout could not be loaded. No payment was started."); return; }
    markOpened.mutate({ orderId: order.orderId });
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "Seller Space",
      description: `${order.productName} × ${order.quantity}`,
      order_id: order.orderId,
      handler: (response: CheckoutResponse) => verifyCheckout.mutate({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }, { onSuccess: () => { toast.success("Seller order signature verified", { description: "Razorpay API or a signed webhook will determine the final observed capture state." }); orders.refetch(); }, onError: error => toast.error(error.message) }),
      modal: { ondismiss: () => { toast.message("Checkout closed. The Seller Space order remains a merchant record."); orders.refetch(); } },
      theme: { color: "#2f80e8" },
    });
    checkout.open();
  }

  function buyProduct(productId: number) {
    if (!isAuthenticated) { startLogin(); return; }
    const orderQuantity = Number(quantity);
    if (!Number.isInteger(orderQuantity) || orderQuantity < 1 || orderQuantity > 10 || buyerLabel.trim().length < 2) { toast.error("Enter a buyer label and a quantity between 1 and 10."); return; }
    createCheckout.mutate({ productId, quantity: orderQuantity, buyerLabel: buyerLabel.trim() }, { onSuccess: launchSellerCheckout, onError: error => toast.error(error.message) });
  }

  function saveFulfillment() {
    if (!selectedOrder) { toast.error("Choose a Seller Space order first."); return; }
    recordFulfillment.mutate({ sellerOrderId: selectedOrder.id, state: fulfillmentState, evidenceNote: evidenceNote.trim() || "Merchant-recorded fulfillment milestone." }, { onSuccess: () => { toast.success("Fulfillment record saved", { description: "This is a merchant record and is shown separately from verified Razorpay facts." }); orders.refetch(); }, onError: error => toast.error(error.message) });
  }

  function simulateScenario() {
    if (!selectedOrder) { toast.error("Choose a Seller Space order first."); return; }
    if (customerStatement.trim().length < 10) { toast.error("Add the customer appeal statement before opening a review."); return; }
    createScenario.mutate({ sellerOrderId: selectedOrder.id, scenarioType, customerStatement: customerStatement.trim(), requestedOutcome }, { onSuccess: result => { toast.success(result.reused ? "Existing dispute review refreshed" : "Dispute review opened", { description: `${display(result.recommendation)} — ${result.reason}` }); scenarios.refetch(); }, onError: error => toast.error(error.message) });
  }

  function createCustomerSpaceAccess() {
    if (!selectedOrder) { toast.error("Choose a Seller Space order before creating customer access."); return; }
    createCustomerAccess.mutate({ sellerOrderId: selectedOrder.id }, { onSuccess: result => { setCustomerAccess(result); toast.success("Customer order access created", { description: "Share the token only with the intended buyer. It binds to the first signed-in customer and expires in seven days." }); }, onError: error => toast.error(error.message) });
  }

  async function copyCustomerAccessToken() {
    if (!customerAccess) return;
    try { await navigator.clipboard.writeText(customerAccess.accessToken); toast.success("Customer access token copied", { description: "Paste it directly into Customer Space for the intended signed-in buyer." }); } catch { toast.error("The browser could not copy the token. Select it manually and share it privately."); }
  }

  function createCustomerCatalogSpaceAccess() {
    createCustomerCatalogAccess.mutate(undefined, { onSuccess: result => { setCustomerCatalogAccess(result); toast.success("Private customer catalog access created", { description: "Share the token only with the intended buyer. Browsing creates no order; Razorpay Checkout opens only after that buyer chooses a product." }); }, onError: error => toast.error(error.message) });
  }

  async function copyCustomerCatalogAccessToken() {
    if (!customerCatalogAccess) return;
    try { await navigator.clipboard.writeText(customerCatalogAccess.accessToken); toast.success("Private catalog token copied", { description: "Send it directly to the intended customer; do not use a public link." }); } catch { toast.error("The browser could not copy the catalog token. Select it manually and share it privately."); }
  }

  const productCount = products.data?.length ?? 0;
  const orderCount = orders.data?.length ?? 0;
  const evidenceReady = orders.data?.filter(order => order.fulfillmentState === "delivered").length ?? 0;
  const capturedOrders = orders.data?.filter(order => order.razorpayObservationState === "api_captured").length ?? 0;
  const workspaceDisplayState = sellerWorkspaceDisplayState({ isAuthenticated, workspaceReady, workspaceError: sellerWorkspace.isError, productCount, orderCount, workspaceProductCount: workspace.productCount, workspaceOrderCount: workspace.orderCount, productsLoading: products.isLoading, ordersLoading: orders.isLoading, productsError: products.isError, ordersError: orders.isError });

  return <div className="seller-space-page seller-command-page">
    <header className="merchant-topbar"><div className="brand-mark"><span className="brand-slash">◢</span><span>DisputeShield</span></div><nav className="top-links"><Link href="/">Merchant home</Link><Link href="/payments">Payments</Link><strong>Seller Space</strong><span>Risk operations</span></nav><div className="top-actions"><span className="secure-flag">Merchant controlled</span><button className="avatar">{user?.name?.slice(0, 2).toUpperCase() ?? "AM"}</button></div></header>
    <main className="seller-space-main">
      <Link href="/" className="back-link"><ArrowLeft size={15} /> Back to dispute operations</Link>
      <section className="seller-command-hero"><div className="hero-grid-mark" /><div className="seller-hero-copy"><div className="hero-kicker"><Activity size={14} /> Seller operations command center</div><h1>Operate every order.<br /><em>Defend the right one.</em></h1><p>Seller Space gives a local merchant one disciplined path from catalog and payment to fulfilment evidence and a product-not-received decision.</p><div className="hero-route"><span><b>01</b> Catalog</span><ArrowRight size={14} /><span><b>02</b> Razorpay payment</span><ArrowRight size={14} /><span><b>03</b> Fulfilment proof</span><ArrowRight size={14} /><strong><b>04</b> Dispute decision</strong></div></div><aside className="hero-integrity"><div><BadgeCheck size={18} /><span>Evidence integrity</span></div><p>Merchant records, Razorpay API facts, signed webhooks and demonstration scenarios never share the same status.</p><div className="integrity-key"><span className="merchant-key" /> Merchant record <span className="razorpay-key" /> Razorpay fact <span className="webhook-key" /> Webhook verified</div></aside></section>
      {workspaceDisplayState === "locked" ? <section className="seller-auth command-auth"><div className="auth-icon"><ShieldAlert size={22} /></div><div><div className="eyebrow">Merchant workspace locked</div><h2>Sign in to launch the Seller Space command center</h2><p>Products, orders, fulfilment evidence and scenarios are isolated to the merchant workspace—not exposed as sample data.</p></div><Button onClick={startLogin}>Sign in as merchant <ArrowRight size={15} /></Button></section> : workspaceDisplayState === "verifying" || workspaceDisplayState === "synchronizing" ? <section className="seller-auth command-auth"><div className="auth-icon"><Activity size={22} /></div><div><div className="eyebrow">Verifying merchant workspace</div><h2>{workspaceDisplayState === "synchronizing" ? "Synchronizing catalog and order data" : "Loading the server-confirmed workspace"}</h2><p>{workspaceDisplayState === "synchronizing" ? "The active merchant identity is confirmed. Seller Space is waiting for catalog and order queries to match that same protected workspace." : "Catalog and order records will appear only after the active merchant identity is confirmed."}</p></div></section> : <>
        <div className="workspace-sync"><BadgeCheck size={14} /><span>Server-confirmed merchant workspace</span><code>…{workspace.workspaceRef}</code><span>{workspace.productCount} products · {workspace.orderCount} orders</span></div>
        <section className="command-metrics"><div><span>Active products</span><strong>{productCount}</strong><small>merchant catalog records</small></div><div><span>Local orders</span><strong>{orderCount}</strong><small>Razorpay-linked when Checkout starts</small></div><div><span>Razorpay captured</span><strong>{capturedOrders}</strong><small>API-observed seller orders</small></div><div><span>Evidence ready</span><strong>{evidenceReady}</strong><small>delivered merchant records</small></div></section>
        <section className="seller-command-rail"><div className="rail-label"><Layers3 size={17} /><span>Command rail</span></div><div className="rail-steps"><span className="active"><b>01</b> Build catalog</span><span><b>02</b> Receive payment</span><span><b>03</b> Capture fulfilment</span><span><b>04</b> Test dispute decision</span></div><Button variant="outline" onClick={refreshAll}><Activity size={14} /> Refresh live facts</Button></section>
        <section className="command-workbench">
          <article className="command-panel catalog-setup"><div className="command-panel-head"><div className="panel-number">01</div><div><div className="eyebrow">Catalog control</div><h2>Create a merchant product</h2><p>This creates a local merchant record. It never invents a Razorpay product, transaction, review or customer.</p></div></div><div className="seller-form command-form"><label>Product name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Handmade brass bottle" /></label><div className="form-pair"><label>SKU<input value={sku} onChange={event => setSku(event.target.value)} placeholder="BRS-001" /></label><label>Price · INR<input type="number" min="1" value={price} onChange={event => setPrice(event.target.value)} placeholder="899" /></label></div><div className="form-pair"><label>Available inventory<input type="number" min="0" value={inventory} onChange={event => setInventory(event.target.value)} /></label><label>Description<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Optional merchant description" /></label></div></div><Button onClick={addProduct} disabled={createProduct.isPending}><PackagePlus size={15} /> {createProduct.isPending ? "Saving product…" : "Add to merchant catalog"}</Button></article>
          <aside className="command-panel evidence-focus"><div className="command-panel-head"><div className="panel-number emphasis">04</div><div><div className="eyebrow">Primary defense workflow</div><h2>Product/service not received</h2><p>The product has one high-value question: can the merchant prove delivery without relying on a browser callback or a made-up record?</p></div></div><div className="evidence-stack"><div><span>Payment</span><b>Razorpay reference</b></div><div><span>Fulfilment</span><b>Shipment + delivery evidence</b></div><div><span>Address</span><b>Merchant order match</b></div><div><span>Refund</span><b>Outcome checked before contest</b></div></div><div className="decision-notice"><FileSearch size={16} /><span><b>Decision rule:</b> no delivery proof means <em>human review</em>, not an automatic contest.</span></div></aside>
        </section>
        <section className="seller-section command-catalog"><div className="seller-section-head"><div><div className="eyebrow">Merchant catalog + buyer checkout</div><h2>Products ready for an explicit Razorpay Checkout</h2></div><div className="seller-buyer-fields"><input value={buyerLabel} onChange={event => setBuyerLabel(event.target.value)} placeholder="Buyer label" /><input type="number" min="1" max="10" value={quantity} onChange={event => setQuantity(event.target.value)} aria-label="Quantity" /></div></div><div className="customer-catalog-share"><div><UserRoundCheck size={15} /><span><b>Customer Space catalog access</b>Create a private seven-day catalog token for one buyer. It binds to that buyer’s sign-in; browsing alone creates no order or payment.</span></div><Button variant="outline" onClick={createCustomerCatalogSpaceAccess} disabled={createCustomerCatalogAccess.isPending}>{createCustomerCatalogAccess.isPending ? "Creating catalog access…" : "Create customer catalog access"}</Button>{customerCatalogAccess && <div className="customer-access-token"><code>{customerCatalogAccess.accessToken}</code><Button size="sm" onClick={copyCustomerCatalogAccessToken}>Copy token</Button><small>Expires {new Date(customerCatalogAccess.expiresAt).toLocaleString()}. Share directly, never in a public link.</small></div>}</div>{products.data?.length ? <div className="command-table"><div className="command-row command-label"><span>Product</span><span>Catalog source</span><span>Inventory</span><span>Unit price</span><span /></div>{products.data.filter(product => product.status === "active").map(product => <div className="command-row" key={product.id}><span><b>{product.name}</b><small>{product.description || "Merchant description not provided"} · SKU {product.sku}</small></span><span><i className="merchant-dot" /> Merchant record</span><span>{product.inventoryQuantity} available</span><strong>{rupees(product.unitAmountPaise)}</strong><Button onClick={() => buyProduct(product.id)} disabled={createCheckout.isPending || product.inventoryQuantity < 1}><ExternalLink size={14} /> Checkout</Button></div>)}</div> : <div className="command-empty"><Boxes size={24} /><div><b>This server-confirmed workspace has no catalog records</b><p>Workspace …{workspace.workspaceRef} is isolated from every other merchant. If you expected an existing local order, sign out and return with the merchant identity that created it; otherwise, create a product above.</p></div></div>}</section>
        <section id="order-truth" className="seller-section command-order-section"><div className="seller-section-head"><div><div className="eyebrow">Order truth layer</div><h2>Payment facts, fulfilment records and evidence readiness</h2></div><span className="section-chip"><WalletCards size={14} /> No inferred payment state</span></div>{orders.data?.length ? <div className="command-order-grid"><div className="seller-order-list command-order-list">{orders.data.map(order => { const paymentFact = sellerPaymentFact(order); return <button key={order.id} className={`seller-order-row ${selectedOrder?.id === order.id ? "selected" : ""}`} onClick={() => setSelectedOrderId(order.id)}><span><b>{order.orderReference}</b><small>{order.productName} × {order.quantity} · {rupees(order.totalAmountPaise)}</small></span><span className={`seller-status ${paymentFact.tone}`}>{paymentFact.label}</span></button>; })}</div><div className="command-evidence-detail">{selectedOrder ? <>{(() => { const paymentFact = sellerPaymentFact(selectedOrder); return <><div className="detail-top"><div><span>Selected merchant order</span><h3>{selectedOrder.orderReference}</h3></div><span className={`fulfillment-badge ${selectedOrder.fulfillmentState}`}>{display(selectedOrder.fulfillmentState)}</span></div><div className="evidence-columns"><div><span>Razorpay order</span><code>{selectedOrder.razorpayOrderId ?? "No Checkout yet"}</code><small>Razorpay fact when present</small></div><div><span>Payment</span><b>{paymentFact.label}</b><small>{paymentFact.detail}</small></div><div><span>Fulfilment proof</span><b>{display(selectedOrder.fulfillmentState)}</b><small>{selectedOrder.shippingRecord}</small></div></div></>; })()}<div className="seller-form command-fulfilment"><label>Record fulfilment milestone<select value={fulfillmentState} onChange={event => setFulfillmentState(event.target.value as typeof fulfillmentState)}><option value="packed">Packed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="delivery_exception">Delivery exception</option></select></label><label>Evidence note<input value={evidenceNote} onChange={event => setEvidenceNote(event.target.value)} /></label></div><Button onClick={saveFulfillment} disabled={recordFulfillment.isPending}><Truck size={15} /> {recordFulfillment.isPending ? "Saving record…" : "Save merchant fulfilment evidence"}</Button><div className="customer-access-box"><div><UserRoundCheck size={15} /><span><b>Customer Space access</b>Create a seven-day, order-specific access token. It binds to the first signed-in customer and only opens this order’s local case workflow.</span></div><Button variant="outline" onClick={createCustomerSpaceAccess} disabled={createCustomerAccess.isPending}>{createCustomerAccess.isPending ? "Creating access…" : "Create customer access"}</Button>{customerAccess?.orderReference === selectedOrder.orderReference && <div className="customer-access-token"><code>{customerAccess.accessToken}</code><Button size="sm" onClick={copyCustomerAccessToken}>Copy token</Button><small>Expires {new Date(customerAccess.expiresAt).toLocaleString()}. Do not put this token in a public link or chat.</small></div>}</div></> : <div className="command-empty"><PackageCheck size={24} /><p>Select an order to assess its evidence coverage.</p></div>}</div></div> : <div className="command-empty"><PackageCheck size={24} /><div><b>No local orders yet</b><p>Checkout a merchant catalog item to create the order and begin the evidence trail.</p></div></div>}</section>
        <section className="seller-section seller-lab command-lab"><div className="seller-section-head"><div><div className="eyebrow">Customer appeal intake · bounded automation</div><h2>Open a policy-controlled review from the selected order</h2><p>The engine scores evidence, refreshes facts and prepares a draft. It never auto-submits a dispute response, refund, or external appeal.</p></div></div><div className="appeal-intake"><label>Customer appeal statement<textarea value={customerStatement} onChange={event => setCustomerStatement(event.target.value)} maxLength={1000} /></label><label>Customer-requested outcome<select value={requestedOutcome} onChange={event => setRequestedOutcome(event.target.value as typeof requestedOutcome)}><option value="case_review">Request a case review</option><option value="contest_response">Request a contest response</option><option value="customer_resolution">Request a customer resolution</option></select></label><small>Stored as a local merchant record for this demonstration. The requested outcome does not override policy or authorize an external action.</small></div><div className="scenario-controls"><select value={scenarioType} onChange={event => setScenarioType(event.target.value as typeof scenarioType)}>{scenarioOptions.map(([value, label]) => <option key={value} value={value}>{label}{value === "product_not_received" ? " · primary workflow" : " · simulation"}</option>)}</select><Button onClick={simulateScenario} disabled={!selectedOrder || createScenario.isPending}><ShieldAlert size={15} /> {createScenario.isPending ? "Opening review…" : selectedOrder ? "Run policy & open review" : "Select a Seller Space order"}</Button></div><p className="selected-order-hint">{selectedOrder ? <>Selected order: <b>{selectedOrder.orderReference}</b>. The engine prepares facts only; external actions always require merchant approval.</> : "Select an order in the Order truth layer to enable this action."}</p>{scenarios.data?.length ? <div className="scenario-grid">{scenarios.data.map(scenario => <article className="scenario-card" key={scenario.id}><div><span className={scenario.metadata.primary ? "primary-badge" : "demo-badge"}>{scenario.metadata.primary ? "Primary workflow" : "Simulation only"}</span><h3>{scenario.metadata.label}</h3><p>“{scenario.customerClaim}”</p><small>Requested outcome: {display(scenario.requestedOutcome)}</small></div><div><strong className={`recommendation ${scenario.recommendation}`}>{display(scenario.recommendation)}</strong><small>{scenario.metadata.requiredEvidence.join(" · ")}</small></div></article>)}</div> : <div className="command-empty compact"><ClipboardCheck size={23} /><p>Choose an order, then run the bounded policy. It cannot submit a Razorpay dispute or fabricate a payment event.</p></div>}</section>
      </>}
    </main>
  </div>;
}
