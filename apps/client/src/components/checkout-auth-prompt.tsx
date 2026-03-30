/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button } from "@heroui/react";

import { LoginModal } from "@/features/auth/components/login-modal";

interface CheckoutAuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
}

/**
 * Shown after the email step when the user is not authenticated.
 * Explains the benefits of signing in and lets them choose between
 * logging in (via the existing LoginModal) or continuing as a guest.
 */
export function CheckoutAuthPrompt({
  isOpen,
  onClose,
  onContinueAsGuest,
}: CheckoutAuthPromptProps) {
  const { t } = useTranslation();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const handleLoginPress = () => {
    onClose();
    setIsLoginModalOpen(true);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Body className="flex flex-col gap-5 px-6 pt-8 pb-7">
                    {/* Icon */}
                    <div className="flex justify-center">
                      <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center">
                        <svg
                          className="w-7 h-7 text-primary"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Title & description */}
                    <div className="text-center space-y-1.5">
                      <h2 className="text-xl font-bold text-foreground">
                        {t("checkout-auth-prompt-title")}
                      </h2>
                      <p className="text-sm text-default-500 leading-snug">
                        {t("checkout-auth-benefits-desc")}
                      </p>
                    </div>

                    {/* Benefits list */}
                    <ul className="space-y-2.5 text-sm">
                      <li className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
                          <svg
                            className="w-4 h-4 text-primary"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </span>
                        <span className="text-default-700">
                          {t("checkout-benefit-address")}
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
                          <svg
                            className="w-4 h-4 text-primary"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"
                            />
                          </svg>
                        </span>
                        <span className="text-default-700">
                          {t("checkout-benefit-tracking")}
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
                          <svg
                            className="w-4 h-4 text-primary"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                          </svg>
                        </span>
                        <span className="text-default-700">
                          {t("checkout-benefit-history")}
                        </span>
                      </li>
                    </ul>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-1">
                      <Button className="w-full" onPress={handleLoginPress}>
                        {t("log-in")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full text-default-500"
                        onPress={() => {
                          close();
                          onContinueAsGuest();
                        }}
                      >
                        {t("checkout-continue-guest")}
                      </Button>
                    </div>
                  </Modal.Body>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* LoginModal handles the actual Auth0 redirect */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        returnTo="/cart"
      />
    </>
  );
}
