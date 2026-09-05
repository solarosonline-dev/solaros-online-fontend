/* ============================================================
   Verbatim copy for the "PM Surya Ghar: Muft Bijli Yojana" prescribed
   agreement template — sourced from the scheme's official Annexure 2
   model draft agreement between consumer & vendor. Unlike
   agreementDocumentCopy.ts's marketing-style copy, none of this is
   admin-editable — it's the legally prescribed wording for subsidy-case
   agreements, rendered by PmSuryaGharAgreementDocument.tsx.
============================================================ */

export const PMSG_TITLE =
  "Model Draft Agreement between Consumer & Vendor for installation of grid connected rooftop solar (RTS) project under PM – Surya Ghar: Muft Bijli Yojana";

export const PMSG_PREAMBLE_WHEREAS_1 =
  "First Party wishes to install a Grid Connected Rooftop Solar Plant on the rooftop of the residential building of the Consumer under PM Surya Ghar: Muft Bijli Yojana.";

export const PMSG_PREAMBLE_WHEREAS_2 =
  "Second Party has verified availability of appropriate roof and found it feasible to install a Grid Connected Roof Top Solar plant and that the second party is willing to design, supply, install, test, commission and carry out Operation & Maintenance of the Rooftop Solar plant for 5 year period";

export const PMSG_DISCLAIMER =
  "Disclaimer: This agreement is between vendor and consumer and any dispute related to the same shall not involve any third party including MNRE and Distribution Utilities.";

/** "The First Party hereby undertakes to perform the following activities:" */
export const PMSG_CONSUMER_DUTIES: string[] = [
  "Submission of online application at National Portal for installation of RTS project/system, Submission of application for net-metering and system inspection and upload of the relevant documents on the National Portal of the scheme",
  "Provide secure storage of the material of the RTS plant delivered at the premises till handover of the system.",
  "Provide access to the Roof Top during installation of the plant, operation & maintenance, testing of the plant and equipment and for meter reading from solar meter, inverter etc.",
  "Provide electricity during plant installation and water for cleaning of the panels.",
  "Report any malfunctioning of the plant to the Vendor during the warranty period.",
  "Pay the amount as per the payment schedule as mutually agreed with the vendor, including any additional amount to the second party for any additional work /customization required depending upon the building condition",
];

export type PmSuryaGharVendorDuty = { title: string | null; body: string };

/** "The Second Party hereby undertakes to perform the following activities:"
 * Item 15 ("Project/system cost & payment terms") and item 19 ("Mutually
 * Agreed Terms of Payment") are rendered with real cost/payment-schedule
 * tables by the component instead of the source's blank "...". */
export const PMSG_VENDOR_DUTIES: PmSuryaGharVendorDuty[] = [
  {
    title: null,
    body:
      "The Vendor must follow all the standards and safety guidelines prescribed under state regulations and technical standards prescribed by MNRE for RTS projects, failing which the vendor is liable for blacklisting from participation in the govt. project/ scheme and other penal actions in accordance with the law. The responsibility of supply, installation and commissioning of the rooftop solar project/system in complete compliance with MNRE scheme guidelines lies with the Vendor.",
  },
  {
    title: "Site Survey:",
    body:
      "Site visit, survey and development of detailed project report for installation of RTS system. This also includes, feasibility study of roof, strength of roof and shadow free area. If any additional work or customization is involved for the plant installation as per site condition and requirement of the consumer building, the Vendor shall prepare an estimate and can raise separate invoice including GST in addition to the amount towards standard plant cost. The consumer shall pay the amount for such additional work directly to the Vendor.",
  },
  {
    title: "Design & Engineering:",
    body: "Design of plant along with drawings and selection of components as per standard provided by the DISCOM/SERC/MNRE for best performance and safety of the plant.",
  },
  {
    title: "Module and Inverter:",
    body:
      "The solar modules, including the solar cells, should be manufactured in India. Both the solar modules and inverters shall conform to the relevant standards and specifications prescribed by MNRE. Any other requirement, viz. star labelling (solar modules), quality control orders and standards & labelling (inverters) etc., shall also be complied.",
  },
  {
    title: "Procurement & Supply:",
    body:
      "Procurement of complete system as per BIS/IS/IEC standard (whatever applicable) & safety guidelines for installation of rooftop solar plants. The supplied materials should comply with all MNRE standards for release of subsidy.",
  },
  {
    title: "Installation & Civil work:",
    body: "Complete civil work, structure work and electrical work (including drawings) following all the safety and relevant BIS standards.",
  },
  {
    title:
      "Documentation (Technical Catalogues/Warranty Certificates/BIS certificates/other test reports etc):",
    body:
      "All such documents shall be provided to the consumer for online uploading and submission of technical specifications, IEC/BIS report, Sr. Nos, Warranty card of Solar Panel & Inverter, Layout & Electrical SLD, Structure Design and Drawing, Cable and other detailed documents.",
  },
  {
    title: "Project completion report (PCR):",
    body: "Assisting the consumer in filling and uploading of signed documents (Consumer & Vendor) on the national portal.",
  },
  {
    title: "Warranty:",
    body:
      "System warranty certificates should be provided to the consumer. The complete system should be warranted for 5 years from the date of commissioning by DISCOM. Individual component warranty documents provided by the manufacturer shall be provided to the consumer and all possible assistance should be extended to the consumer for claiming the warranty from the manufacturer.",
  },
  {
    title: "NET meter & Grid Connectivity:",
    body: "Net meter supply/procurement, testing and approvals shall be in the scope of vendor. Grid connection of the plant shall be in the scope of the vendor.",
  },
  {
    title: "Testing and Commissioning:",
    body: "The vendor shall be present at the time of testing and commissioning by the DISCOM.",
  },
  {
    title: "Operation & Maintenance:",
    body:
      "Five (5) years Comprehensive Operation and Maintenance including overhauling, wear and tear and regular checking of healthiness of system at proper interval shall be in the scope of vendor. The vendor shall also educate the consumer on best practices for cleaning of the modules and system maintenance.",
  },
  {
    title: "Insurance:",
    body: "Any insurance cost pertaining to material transfer/storage before commissioning of the system shall be in the scope of the vendor.",
  },
  {
    title: "Applicable Standard:",
    body:
      "The system must meet the technical standards and specifications notified by MNRE. The vendor is solely responsible to supply component and service which meets the technical standards and specification prescribed by MNRE and State DISCOMs.",
  },
  {
    title: "Project/system cost & payment terms:",
    body: "The cost of the plant and payment schedule should be mutually discussed and decided between the vendor and consumer. The consumer may opt for milestone-based payment to the vendor and the same shall be included in the agreement.",
  },
  {
    title: "Dispute:",
    body:
      "In-case of any dispute between consumer and vendor (in supply/installation/maintenance of system or payment terms), both parties must settle the same mutually or as per law. MNRE/DISCOM shall not be liable for, and would not be a party to any dispute arising between vendor and consumer.",
  },
  {
    title: "Subsidy / Project Related Documents:",
    body: "Vendor must provide all the documents to consumer and help in uploading the same to National Portal for smooth release of subsidy.",
  },
  {
    title: "Performance of Plant:",
    body:
      "The Performance Ratio (PR) of Plant must be 75% at the time of commissioning of the project by DISCOM or its authorised agency. Vendor must provide (returnable basis) radiation sensor with valid calibration certificate of any NABL / International laboratory at the time of commissioning / testing of the plant. Vendor must maintain the PR of the plant till warranty of project i.e. 5 years from the date of commissioning.",
  },
  {
    title: "Mutually Agreed Terms of Payment",
    body: "",
  },
];

/** Index (0-based) of the "Project/system cost & payment terms" clause in
 * PMSG_VENDOR_DUTIES — rendered with a real system-cost table instead of
 * prose. */
export const PMSG_COST_CLAUSE_INDEX = 14;

/** Index (0-based) of the "Mutually Agreed Terms of Payment" clause in
 * PMSG_VENDOR_DUTIES — rendered with a real payment-schedule table instead
 * of prose. */
export const PMSG_PAYMENT_CLAUSE_INDEX = 18;
