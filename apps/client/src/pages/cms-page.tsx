/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Generic CMS page renderer — displays static multilingual content
 * for informational pages referenced from the footer (about, legal, help, etc.).
 */

import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import DefaultLayout from "@/layouts/default";
import { getCmsPage } from "@/config/cms-content";
import { title as titleCls } from "@/shared/ui/primitives";
import { PageNotFound } from "@/pages/404";

export default function CmsPage() {
  const { handle } = useParams<{ handle: string }>();
  const { i18n } = useTranslation();

  const page = getCmsPage(handle ?? "", i18n.language);

  if (!page) {
    return <PageNotFound />;
  }

  const isRtl = ["ar", "he"].some((lang) =>
    i18n.language.startsWith(lang),
  );

  return (
    <DefaultLayout>
      <section
        className="flex flex-col items-center justify-start gap-6 py-10 md:py-16"
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="w-full max-w-3xl px-4">
          {/* Page title */}
          <h1 className={titleCls({ class: "mb-4" })}>{page.title}</h1>

          {/* Lead paragraph */}
          <p className="text-default-600 text-lg leading-relaxed mb-10">
            {page.lead}
          </p>

          {/* Sections */}
          <div className="flex flex-col gap-8">
            {page.sections.map((section, idx) => (
              <article key={idx}>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {section.heading}
                </h2>
                <p className="text-default-600 leading-relaxed">{section.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </DefaultLayout>
  );
}
