import { useTranslation } from "react-i18next";
import DefaultLayout from "@/layouts/default";
import { useCart } from "@/hooks/use-cart";
import { createCart, addItemsToCart, checkoutCart, getAvailableShippingRates } from "@/lib/store-api";
import { Button, Card, Input } from "@heroui/react";
import { useState, useEffect } from "react";
import { formatMoney } from "@/utils/currency";
import { resolveTitleWithVariant } from "@/utils/description";
import ShippingAddressForm from "@/components/shipping-address-form";
import ShippingRateSelector from "@/components/shipping-rate-selector";
import { useAuth } from "@/authentication";
import { SaveCartButton } from "@/components/save-cart-button";
import { CheckoutAuthPrompt } from "@/components/checkout-auth-prompt";
import { SavedAddressesSelector } from "@/components/saved-addresses-selector";

type CheckoutStep = "initial" | "shipping-address" | "shipping-rate" | "processing";

const FALLBACK_IMG = "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

export default function CartPage() {
  const { t, i18n } = useTranslation();
  const { items, updateQuantity, removeItem, clear, totalCents } = useCart();
  const { user, isAuthenticated } = useAuth() as any;

  // Checkout workflow state
  const [step, setStep] = useState<CheckoutStep>("initial");
  const [email, setEmail] = useState("");
  const [currentCart, setCurrentCart] = useState<any>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  // true = show manual ShippingAddressForm; false = show SavedAddressesSelector (if authenticated)
  const [showManualAddressForm, setShowManualAddressForm] = useState(false);

  // Pre-fill email from authenticated user for a smoother post-login return
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  /**
   * Called when user clicks "Continue to Address".
   * If the user is not authenticated, shows the auth prompt first.
   * Otherwise jumps straight to creating the cart.
   */
  const handleInitialCheckoutClick = () => {
    if (!email || !email.includes("@")) {
      setCheckoutError(t("checkout-invalid-email"));
      return;
    }
    setCheckoutError(null);

    if (!isAuthenticated) {
      setShowAuthPrompt(true);
    } else {
      void proceedToAddressStep();
    }
  };

  /**
   * Creates the cart on the backend and moves to the shipping-address step.
   * Called either directly (authenticated) or after the auth prompt decision.
   */
  const proceedToAddressStep = async () => {
    setShowAuthPrompt(false);
    setShowManualAddressForm(false);
    try {
      const cart = await createCart(email, i18n.language);
      setCurrentCart(cart);
      const updatedCart = await addItemsToCart(
        cart.id,
        items.map((i) => ({ sku: i.sku, qty: i.qty })),
      );
      setCurrentCart(updatedCart);

      // Detect digital-only carts: the backend returns [] when no physical items exist,
      // even before a shipping address is set. Physical carts throw a 400 here.
      let isDigitalOnly = false;
      try {
        const { items: rates } = await getAvailableShippingRates(cart.id);
        isDigitalOnly = rates.length === 0;
      } catch {
        // Backend threw 400 "No shipping address set" → cart has physical items.
        isDigitalOnly = false;
      }

      if (isDigitalOnly) {
        await proceedToPayment(cart.id, "initial");
      } else {
        setStep("shipping-address");
      }
    } catch (err: any) {
      setCheckoutError(err?.message || t("checkout-failed"));
      console.error("Checkout error:", err);
    }
  };

  const handleShippingAddressSuccess = async (cart: any) => {
    // Cart already has the address saved, move to shipping rate selection
    setCurrentCart(cart);
    setStep("shipping-rate");
  };

  /** Redirect to Stripe checkout for the given cart id. */
  const proceedToPayment = async (cartId: string, fallbackStep: CheckoutStep = "shipping-rate") => {
    setStep("processing");
    try {
      const storeUrl = (import.meta.env.STORE_URL || "").replace(/\/$/, "");
      const { checkout_url } = await checkoutCart(
        cartId,
        `${storeUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        window.location.href,
      );
      // DO NOT call clear() here — keep cart intact so the user can
      // return from Stripe without losing their basket.
      window.location.href = checkout_url;
    } catch (err: any) {
      setCheckoutError(err?.message || t("checkout-failed"));
      setStep(fallbackStep);
      console.error("Checkout error:", err);
    }
  };

  const handleShippingRateSelect = async (cart: any) => {
    // Shipping rate is already saved on cart, now proceed to Stripe checkout
    setCurrentCart(cart);
    await proceedToPayment(cart.id);
  };

  const handleBackToAddresses = () => {
    setStep("shipping-address");
  };

  const handleBackToCart = () => {
    setStep("initial");
    setCurrentCart(null);
    setCheckoutError(null);
    setShowManualAddressForm(false);
  };

  return (
    <DefaultLayout>
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-2xl font-semibold mb-6">{t("cart")}</h1>

        {items.length === 0 ? (
          <p>{t("cart-empty")}</p>
        ) : (
          <div className="space-y-6">
            {/* Cart items (always shown while not processing) */}
            {step !== "processing" && (
              <div className="space-y-4">
                {items.map((item) => (
                  <Card key={item.sku} className="border-default-100">
                    <Card.Content className="flex items-center gap-4">
                      <img
                        src={item.image_url || FALLBACK_IMG}
                        alt={resolveTitleWithVariant(item.title, i18n.language)}
                        className="w-16 h-16 object-cover rounded-lg shrink-0"
                        onError={(e) =>
                          ((e.target as HTMLImageElement).src = FALLBACK_IMG)
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{resolveTitleWithVariant(item.title, i18n.language)}</p>
                        <p className="text-sm text-default-500">
                          {formatMoney(item.price_cents, item.currency || "USD")}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              onPress={() => updateQuantity(item.sku, item.qty - 1)}
                            >
                              –
                            </Button>
                            <span className="px-2 text-sm text-default-900">{item.qty}</span>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              onPress={() => updateQuantity(item.sku, item.qty + 1)}
                            >
                              +
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onPress={() => removeItem(item.sku)}
                          >
                            {t("remove")}
                          </Button>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-default-900">
                          {formatMoney(item.price_cents * item.qty, item.currency || "USD")}
                        </p>
                      </div>
                    </Card.Content>
                  </Card>
                ))}

                <Card className="border-default-200">
                  <Card.Content className="space-y-2">
                    <div className="flex justify-between text-sm text-default-600">
                      <span>{t("admin-orders-subtotal") || "Subtotal"}</span>
                      <span>{formatMoney(currentCart?.totals?.subtotal_cents ?? totalCents, items[0]?.currency || "USD")}</span>
                    </div>
                    {currentCart?.totals && currentCart.totals.discount_cents > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>{t("admin-orders-discount")}</span>
                        <span>-{formatMoney(currentCart.totals.discount_cents, items[0]?.currency || "USD")}</span>
                      </div>
                    )}
                    {currentCart?.totals && currentCart.totals.shipping_cents > 0 && (
                      <div className="flex justify-between text-sm text-default-600">
                        <span>{t("admin-orders-shipping") || "Shipping"}</span>
                        <span>{formatMoney(currentCart.totals.shipping_cents, items[0]?.currency || "USD")}</span>
                      </div>
                    )}
                    {currentCart?.totals && currentCart.totals.tax_cents > 0 && (
                      <div className="flex justify-between text-sm text-default-600">
                        <span>{currentCart.totals.tax_inclusive ? t("checkout-tax-included") : (t("admin-orders-tax") || "Tax")}</span>
                        <span>{formatMoney(currentCart.totals.tax_cents, items[0]?.currency || "USD")}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                      <span>{t("total")}</span>
                      <span>{formatMoney(currentCart?.totals?.total_cents ?? totalCents, items[0]?.currency || "USD")}</span>
                    </div>
                  </Card.Content>
                </Card>
              </div>
            )}

            {/* Step 1: Email input */}
            {step === "initial" && (
              <Card className="border-primary">
                <Card.Header>
                  <h2 className="text-lg font-semibold">{t("checkout")}</h2>
                </Card.Header>
                <Card.Content className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm text-default-500 mb-2">
                      {t("email-label")}
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleInitialCheckoutClick();
                      }}
                      placeholder="customer@example.com"
                    />
                  </div>

                  {checkoutError && (
                    <p className="text-red-400 text-sm">{checkoutError}</p>
                  )}

                  <p className="text-sm text-default-500">
                    {t("checkout-continue-note")}
                  </p>

                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        onClick={() => clear()}
                      >
                        {t("cart-clear")}
                      </Button>
                      <SaveCartButton
                        cartId={currentCart?.id}
                        onBeforeSave={async (): Promise<string> => {
                          if (!user?.email) throw new Error("Authentication required");
                          const cart = await createCart(user.email, i18n.language);
                          setCurrentCart(cart);
                          await addItemsToCart(
                            cart.id,
                            items.map((i) => ({ sku: i.sku, qty: i.qty }))
                          );
                          return cart.id;
                        }}
                      />
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleInitialCheckoutClick}
                      isDisabled={!email}
                    >
                      {t("continue-to-address") || "Continue to Address"}
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            )}

            {/* Step 2: Shipping address */}
            {step === "shipping-address" && currentCart && (
              isAuthenticated && !showManualAddressForm ? (
                <SavedAddressesSelector
                  cartId={currentCart.id}
                  onSuccess={handleShippingAddressSuccess}
                  onAddNew={() => setShowManualAddressForm(true)}
                />
              ) : (
                <ShippingAddressForm
                  cartId={currentCart.id}
                  onSuccess={handleShippingAddressSuccess}
                />
              )
            )}

            {/* Step 3: Shipping rate selection */}
            {step === "shipping-rate" && currentCart && (
              <ShippingRateSelector
                cartId={currentCart.id}
                onSelect={handleShippingRateSelect}
                onBack={handleBackToAddresses}
              />
            )}

            {/* Processing step */}
            {step === "processing" && (
              <Card className="border-default-200">
                <Card.Content className="text-center py-8">
                  <p className="text-default-500 mb-4">{t("processing")}</p>
                  <p className="text-sm text-default-400">
                    {t("redirecting-to-payment")}
                  </p>
                </Card.Content>
              </Card>
            )}

            {/* Back to cart button (shown during address/shipping steps) */}
            {(step === "shipping-address" || step === "shipping-rate") && (
              <Button
                variant="outline"
                onClick={handleBackToCart}
                size="sm"
              >
                {t("back-to-cart")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Auth prompt modal — shown after email step when user is not logged in */}
      <CheckoutAuthPrompt
        isOpen={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        onContinueAsGuest={() => void proceedToAddressStep()}
      />
    </DefaultLayout>
  );
}
