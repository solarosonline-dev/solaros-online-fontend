import { useMemo, type ReactNode } from "react";
import type { Entity } from "../../../api/entity";
import type {
  Branding,
  ComponentDefault,
  PaymentScheduleRow,
  Typography,
} from "../../../api/entityPreferences";
import { DEFAULT_PAYMENT_SCHEDULE } from "../../../api/entityPreferences";
import { computeQuote } from "../../../lib/quoteCalculations";
import QuoteDocument, { type QuoteDocumentBranding } from "../../quotes/QuoteDocument";
import BrandingTab from "./BrandingTab";
import TypographyTab from "./TypographyTab";

type Props = {
  entityId: number;
  entity: Entity;
  brandingDraft: Branding;
  typographyDraft: Typography;
  onChangeBranding: (draft: Branding) => void;
  onChangeTypography: (draft: Typography) => void;
  paymentScheduleRows: PaymentScheduleRow[];
  componentDefaults: ComponentDefault[];
  defaultPricePerWatt: number;
  defaultTaxRate: number;
  /** The shared Save/Reset bar, rendered at the end of the form column
   * rather than after the whole tab -- the live preview below can be much
   * taller than the form, and below the 1080px breakpoint (see
   * EntityManagementPage.css) the two columns stack, so appending it after
   * the preview instead would bury Save under the entire sample document. */
  formFooter: ReactNode;
};

// A fixed, made-up 5 kW residential scenario -- purely illustrative, never
// sent anywhere -- just enough of a "real" quote shape (metrics, pricing
// table, AMC tile, payment schedule) that an admin can actually see how a
// color/logo/font-size edit reads on the document customers receive,
// instead of having to imagine it from a color swatch and a px number.
const SAMPLE_CAPACITY_KW = 5;
const SAMPLE_TARIFF = 9;
const FALLBACK_COMPONENTS = [
  { particular: "Solar panels", qty: 10, price: 9000, tax_percent: 13.8, warranty_years: 25, specification: "540 Wp mono-PERC" },
  { particular: "Inverter", qty: 1, price: 45000, tax_percent: 13.8, warranty_years: 10, specification: "5 kW string inverter" },
  { particular: "Mounting structure", qty: 1, price: 30000, tax_percent: 18, warranty_years: 10, specification: "Hot-dip galvanized" },
];

export default function BrandingTypographyTab({
  entityId,
  entity,
  brandingDraft,
  typographyDraft,
  onChangeBranding,
  onChangeTypography,
  paymentScheduleRows,
  componentDefaults,
  defaultPricePerWatt,
  defaultTaxRate,
  formFooter,
}: Props) {
  const pricePerWatt = defaultPricePerWatt || 45;
  const taxRate = defaultTaxRate || 13.8;

  const computed = useMemo(
    () =>
      computeQuote({
        capacityKw: SAMPLE_CAPACITY_KW,
        pricePerWatt,
        taxRate,
        dailyYield: 4.2,
        tariff: SAMPLE_TARIFF,
        applySubsidy: true,
        subsidyAmount: null,
        segment: "residential",
        amcRatePerKw: 1200,
        amcDurationYears: 5,
      }),
    [pricePerWatt, taxRate],
  );

  // Reuses the entity's own default component list (with a made-up price
  // split) when one is configured, so the preview's "Component-wise
  // pricing" section shows real particulars/warranties instead of throwaway
  // placeholders -- falls back to a generic 3-row list otherwise.
  const components = useMemo(() => {
    if (componentDefaults.length === 0) return FALLBACK_COMPONENTS;
    const perItemPrice = Math.round((pricePerWatt * SAMPLE_CAPACITY_KW * 1000) / componentDefaults.length);
    return componentDefaults.map((c) => ({
      particular: c.particular,
      qty: 1,
      price: perItemPrice,
      tax_percent: c.tax_percent,
      warranty_years: c.warranty_years,
      specification: c.specification,
    }));
  }, [componentDefaults, pricePerWatt]);

  const branding: QuoteDocumentBranding = useMemo(
    () => ({
      entityName: entity.name || "SolarOS",
      primaryColor: brandingDraft.primary_color,
      logoUrl: brandingDraft.logo_url,
      tagline: brandingDraft.company_tagline,
      footerTag: brandingDraft.footer_tag,
      gstno: entity.gstno,
      address: entity.address,
      businessPhone: entity.business_phone,
      businessEmail: entity.business_email,
      currency: entity.currency,
      tax_label: entity.tax_label,
      tax_id_label: entity.tax_id_label,
      typography: {
        h1: typographyDraft.h1_font_size,
        h2: typographyDraft.h2_font_size,
        h3: typographyDraft.h3_font_size,
        body: typographyDraft.body_font_size,
        small: typographyDraft.small_font_size,
      },
    }),
    [entity, brandingDraft, typographyDraft],
  );

  return (
    <div className="entity-bt-grid">
      <div className="entity-bt-form">
        <h3 className="entity-bt-heading">Branding</h3>
        <BrandingTab entityId={entityId} draft={brandingDraft} onChange={onChangeBranding} />

        <h3 className="entity-bt-heading">Typography</h3>
        <TypographyTab draft={typographyDraft} onChange={onChangeTypography} />

        {formFooter}
      </div>

      <div className="entity-bt-preview">
        <p className="entity-bt-preview-label">
          Live preview <span>— a sample quote, so you can see how these settings will actually look</span>
        </p>
        <div className="entity-bt-preview-frame">
          <QuoteDocument
            quoteNumber="Q-SAMPLE-PREVIEW"
            createdAt={null}
            validityDays={15}
            capacityKw={SAMPLE_CAPACITY_KW}
            panelMake="Sample Panels Co."
            inverterMake="Sample Inverters Inc."
            panelType="DCR"
            notes={null}
            terms={[]}
            components={components}
            customerName="Sample Customer"
            customerCompany={null}
            customerAddress="123 Sample Street, Sample City"
            customerDiscom="BESCOM"
            customerMobile="+91 98765 43210"
            customerEmail="customer@example.com"
            segment="residential"
            pricePerWatt={pricePerWatt}
            taxRate={taxRate}
            tariff={SAMPLE_TARIFF}
            computed={computed}
            amc={{
              name: "Standard AMC",
              ratePerKw: 1200,
              inclusion: ["Quarterly panel cleaning", "24/7 remote monitoring", "Free spare parts"],
            }}
            amcDurationYears={5}
            amcMode="included"
            amcPost5={{ enabled: false, plans: [] }}
            loan={{ enabled: false, amount: null, ratePercent: null, tenureYears: null }}
            paymentSchedule={paymentScheduleRows.length > 0 ? paymentScheduleRows : DEFAULT_PAYMENT_SCHEDULE}
            branding={branding}
          />
        </div>
      </div>
    </div>
  );
}
