/* ============================================================
   SolarOS — Multi-language translations
   Supports major Indian languages for quotes & agreements.
   Usage: import { translate, formatters } from './translations.js'
============================================================ */

const TRANSLATIONS = {
  en: {
    // Quote - Header
    "quote.tagline": "Zero bills. Zero emissions.",
    "quote.title": "Solar Rooftop Quote",
    "quote.quoteNo": "Quote no.",
    "quote.issued": "Issued",
    "quote.validTill": "Valid till",

    // Quote - Hero
    "quote.personalizedProposal": "Personalised proposal",
    "quote.residential": "Residential",
    "quote.commercial": "Commercial",
    "quote.industrial": "Industrial",
    "quote.farm": "Agri / Farm",

    // Quote - Metrics
    "quote.systemSize": "System size",
    "quote.monthlySavings": "Monthly savings",
    "quote.generation": "Generation",
    "quote.payback": "Payback",
    "quote.co2Avoided": "CO₂ avoided",
    "quote.lifetimeSavings": "25-yr net savings",
    "quote.perMonth": "/mo",
    "quote.perYear": "/yr",
    "quote.years": "yrs",
    "quote.thenFreePower": "then 20+ yrs of free power",
    "quote.afterRecovering": "after recovering investment",
    "quote.treesEquivalent": "trees-equivalent",

    // Quote - Commercial
    "quote.commercialSummary": "Commercial summary",
    "quote.item": "Item",
    "quote.calculation": "Calculation",
    "quote.amount": "Amount",
    "quote.systemCostExGST": "System cost (ex-GST)",
    "quote.gstAt": "GST @",
    "quote.totalProjectCost": "Total project cost",
    "quote.inclusiveGST": "Inclusive of GST",
    "quote.lessSubsidy": "Less: PM Surya Ghar subsidy",
    "quote.subsidyNote": "Filed by us, credited direct to your bank",
    "quote.yourInvestment": "Your investment",
    "quote.netOfSubsidy": "Net of subsidy",
    "quote.noSubsidyApplied": "no subsidy applied",

    // Quote - Inclusions
    "quote.whatsIncluded": "What's included",
    "quote.turnkeyNoSurprises": "turnkey, no surprises",
    "quote.panels": "panels",
    "quote.panelWarranty": "30-yr linear performance · ≥80 % output at year 25",
    "quote.inverter": "Tier-1 string inverter",
    "quote.inverterWarranty": "10-yr warranty · IP65 · WiFi monitoring built-in",
    "quote.structure": "Elevated GI mounting structure",
    "quote.structureWarranty": "10-yr anti-corrosion · zero roof-leak guarantee",
    "quote.cabling": "DC + AC cabling, ACDB & DCDB",
    "quote.cablingSpec": "IS-7098-2 cables · IP65 enclosures · SPD & isolators",
    "quote.earthing": "Earthing, lightning & surge protection",
    "quote.earthingSpec": "Copper-bonded electrodes · Type-2 SPD · IS-3043 compliant",
    "quote.paperwork": "Single-window paperwork",
    "quote.paperworkSpec": "PM Surya Ghar registration · DISCOM net-metering · loan facilitation",
    "quote.monitoring": "WiFi monitoring + WhatsApp savings report",
    "quote.monitoringSpec": "Live generation & lifetime savings on your phone",
    "quote.performancePromise": "Performance Promise",
    "quote.performanceSpec": "≥80 % design generation guaranteed in writing",

    // Quote - AMC
    "quote.amcTitle": "5-year AMC",
    "quote.amcSubtitle": "we stay on the roof with you, most installers vanish after commissioning.",
    "quote.recommended": "Recommended",
    "quote.years1to5": "Years 1–5",
    "quote.amcFeatures": [
      "Quarterly panel cleaning",
      "Annual inverter health check",
      "Earthing & lightning audit",
      "WhatsApp savings report monthly",
      "48-hour service response SLA"
    ],
    "quote.amcNote": "Comprehensive AMC — cleaning, monitoring and service — at {price} per kW per year. Keeps your system generating at peak and under our care from day one.",

    // Quote - Payment
    "quote.paymentSchedule": "Payment schedule",
    "quote.payAdvance": "on signing",
    "quote.payAdvanceNote": "Confirms PO and locks panel allocation",
    "quote.payDispatch": "before material dispatch",
    "quote.payDispatchNote": "~Day 5 once design + paperwork are signed off",
    "quote.payCommission": "on commissioning",
    "quote.payCommissionNote": "Day 7–10 — net-meter live, generating units",
    "quote.total": "Total",
    "quote.paymentMethod": "NEFT / RTGS / Cheque to SolarOS",
    "quote.subsidyPaymentNote": "PM Surya Ghar subsidy of {amount} credits to your bank account ~30 days after net-meter activation. We handle the entire filing — you sign three forms.",

    // Quote - Timeline
    "quote.timeline": "From go-ahead to first units — 7 to 10 days",
    "quote.day": "Day",
    "quote.siteSurvey": "Site survey",
    "quote.siteSurveyNote": "Drone scan, shadow analysis, structural check",
    "quote.designBOQ": "Design & BOQ",
    "quote.designBOQNote": "3-D layout, single-line diagram, panel-level layout shared",
    "quote.paperworkTimeline": "Paperwork",
    "quote.paperworkTimelineNote": "PM Surya Ghar registration, DISCOM application, loan if needed",
    "quote.installation": "Installation",
    "quote.installationNote": "Mounting, panels, inverter, cables — photos sent on WhatsApp every hour",
    "quote.commissioning": "Commissioning",
    "quote.commissioningNote": "Net-meter installed by DISCOM, monitoring app active, training",
    "quote.ongoing": "Ongoing support",
    "quote.ongoingNote": "Cleaning, monitoring, monthly savings report",

    // Quote - Terms
    "quote.terms": "Terms — short and honest",
    "quote.termsValidity": "Validity: this quote is valid for {days} days from issue.",
    "quote.termsGeneration": "Generation: figures based on MNRE solar atlas; actual yield ±5 % depending on weather, dust, shading.",
    "quote.termsSubsidy": "Subsidy: filed entirely by SolarOS. If CFA is not credited within 45 days of net-meter activation, we'll waive that portion of the final invoice.",
    "quote.termsNetMetering": "Net metering: we file with your DISCOM; their bi-directional meter installation is on their schedule (typically 2–3 weeks after our application).",
    "quote.termsForceMajeure": "Force majeure: we're not liable for delays caused by natural calamity, government order, or DISCOM delays.",
    "quote.termsJurisdiction": "Jurisdiction: Delhi / Gurugram courts.",

    // Quote - CTA
    "quote.readyTitle": "Ready to make this real?",
    "quote.readyText": "Reply to this quote on WhatsApp or call — we'll book a site visit within 48 hours.",
    "quote.confirmWhatsApp": "Confirm on WhatsApp",
    "quote.callUs": "Call Us",

    // Quote - Footer
    "quote.additionalNotes": "Additional Notes",
    "quote.poweredBy": "Powered by",
    "quote.customerAcceptance": "Customer acceptance",
    "quote.nameAndDate": "Name & Date",

    // Agreement - Header
    "agreement.title": "Solar Rooftop Installation Agreement",
    "agreement.agreementNo": "Agreement no.",
    "agreement.date": "Date",
    "agreement.system": "System",
    "agreement.quoteRef": "Quote ref.",
    "agreement.between": "Between {firmName} & Customer",

    // Agreement - Scope
    "agreement.scopeTitle": "What SolarOS provides",
    "agreement.scopeSubtitle": "turnkey scope",
    "agreement.supplyInstall": "Supply & installation",
    "agreement.supplyInstallNote": "Solar panels, inverter, mounting structure, cabling, earthing & safety components",
    "agreement.completeSiteWork": "Complete site work",
    "agreement.completeSiteWorkNote": "Site survey, installation, testing and commissioning",
    "agreement.singleWindow": "Single-window paperwork",
    "agreement.singleWindowNote": "Net-metering application, DISCOM coordination, PM Surya Ghar subsidy filing (if eligible)",
    "agreement.handoverPack": "Handover pack",
    "agreement.handoverPackNote": "Manufacturer warranty cards (panels & inverter), test reports and user manual",

    // Agreement - Equipment
    "agreement.equipmentTitle": "Equipment — make, model & warranty",
    "agreement.component": "Component",
    "agreement.make": "Make",
    "agreement.model": "Model",
    "agreement.warranty": "Warranty",
    "agreement.solarPanels": "Solar Panels",
    "agreement.inverter": "Inverter",
    "agreement.acdb": "ACDB",
    "agreement.dcdb": "DCDB",
    "agreement.warrantyNote": "Warranty on all electrical components is as provided by the make and model, and warranty cards are handed over before installation. Beyond the stated warranty period, repair or replacement is at the customer's cost.",

    // Agreement - Payment
    "agreement.paymentSchedule": "Payment schedule",
    "agreement.payAdvance": "advance",
    "agreement.payAdvanceNote": "On signing this agreement",
    "agreement.payStructure": "structure & fitting",
    "agreement.payStructureNote": "After structure and panels are fitted",
    "agreement.payNetMeter": "net metering",
    "agreement.payNetMeterNote": "Within 3 days of net-metering completion",

    // Agreement - AMC
    "agreement.amcTitle": "Annual Maintenance Contract (AMC)",
    "agreement.amcSubtitle": "choose one",
    "agreement.basicAMC": "Basic AMC",
    "agreement.basic": "Basic",
    "agreement.premiumAMC": "Premium AMC · recommended",
    "agreement.premium": "Premium",
    "agreement.basicFeatures": [
      "Quarterly inspection (4/yr)",
      "Electrical & earthing checks",
      "Performance / generation report",
      "Priority service & warranty-claim support"
    ],
    "agreement.premiumFeatures": [
      "Everything in Basic, plus:",
      "Quarterly panel cleaning (4/yr)",
      "One free service visit / year",
      "10% discount on spare parts"
    ],
    "agreement.amcWarning": "Installation workmanship is warranted for 12 months, valid only while an AMC is active. Without AMC, after 12 months SolarOS is not responsible for warranty, service or system performance, and any visit is charged separately.",

    // Agreement - Warranty
    "agreement.warrantyTitle": "Warranty & liability",
    "agreement.warrantySubtitle": "please read carefully",
    "agreement.warrantyEquipment": "Equipment (panels, inverter, ACDB, DCDB): covered by the manufacturer as per make/model. Warranty cards are given to you before installation. Claims are made with the manufacturer. After the warranty period, repair/replacement is at the customer's cost.",
    "agreement.warrantyInstallation": "Installation (workmanship): {firmName} covers workmanship for 12 months — valid only if you take AMC.",
    "agreement.warrantyWithoutAMC": "Without AMC: after 12 months {firmName} is not responsible for warranty, service or system performance. Any visit will be charged separately.",
    "agreement.warrantyNotCovered": "Not covered: damage from natural disaster, lightning, fire, theft, negligence or unauthorised changes; actual bill savings & generation (depend on sunlight, usage, tariff); DISCOM delays and government subsidy timelines/approval.",
    "agreement.warrantyJurisdiction": "Jurisdiction: courts at {city} have jurisdiction. This agreement is the complete understanding; changes must be in writing, signed by both parties.",

    // Agreement - Footer
    "agreement.authorisedSignatory": "Authorised signatory",
    "agreement.nameSignatureDate": "Name, Signature & Date",
    "agreement.customerAcceptance": "Customer acceptance",
    "agreement.customerAck": "I confirm I have read and understood this agreement, including that without AMC, {firmName} is not responsible after 12 months.",
    "agreement.signedElectronically": "Signed electronically on",
    "agreement.amcChosen": "AMC plan chosen:",
    "agreement.consentRecorded": "Consent recorded — the customer accepted the terms above.",
    "agreement.noAMC": "No AMC",

    // Common
    "common.at": "at",
    "common.current": "current",
    "common.tariff": "tariff"
  },

  hi: {
    // Quote - Header
    "quote.tagline": "शून्य बिल। शून्य उत्सर्जन।",
    "quote.title": "सोलर रूफटॉप कोटेशन",
    "quote.quoteNo": "कोटेशन नं.",
    "quote.issued": "जारी किया",
    "quote.validTill": "मान्य तिथि",

    // Quote - Hero
    "quote.personalizedProposal": "व्यक्तिगत प्रस्ताव",
    "quote.residential": "आवासीय",
    "quote.commercial": "व्यावसायिक",
    "quote.industrial": "औद्योगिक",
    "quote.farm": "कृषि / फार्म",

    // Quote - Metrics
    "quote.systemSize": "सिस्टम का आकार",
    "quote.monthlySavings": "मासिक बचत",
    "quote.generation": "उत्पादन",
    "quote.payback": "रिकवरी समय",
    "quote.co2Avoided": "CO₂ बचत",
    "quote.lifetimeSavings": "25 वर्ष की कुल बचत",
    "quote.perMonth": "/माह",
    "quote.perYear": "/वर्ष",
    "quote.years": "वर्ष",
    "quote.thenFreePower": "फिर 20+ वर्ष मुफ्त बिजली",
    "quote.afterRecovering": "निवेश वापसी के बाद",
    "quote.treesEquivalent": "पेड़ के बराबर",

    // Quote - Commercial
    "quote.commercialSummary": "वाणिज्यिक सारांश",
    "quote.item": "मद",
    "quote.calculation": "गणना",
    "quote.amount": "राशि",
    "quote.systemCostExGST": "सिस्टम लागत (GST रहित)",
    "quote.gstAt": "GST @",
    "quote.totalProjectCost": "कुल परियोजना लागत",
    "quote.inclusiveGST": "GST सहित",
    "quote.lessSubsidy": "घटाएं: PM सूर्य घर सब्सिडी",
    "quote.subsidyNote": "हमारे द्वारा दायर, सीधे आपके बैंक में जमा",
    "quote.yourInvestment": "आपका निवेश",
    "quote.netOfSubsidy": "सब्सिडी के बाद",
    "quote.noSubsidyApplied": "कोई सब्सिडी लागू नहीं",

    // Quote - Inclusions
    "quote.whatsIncluded": "क्या शामिल है",
    "quote.turnkeyNoSurprises": "टर्नकी, कोई छिपी लागत नहीं",
    "quote.panels": "पैनल",
    "quote.panelWarranty": "30 वर्ष की लीनियर वारंटी · 25वें वर्ष में ≥80% उत्पादन",
    "quote.inverter": "टियर-1 स्ट्रिंग इन्वर्टर",
    "quote.inverterWarranty": "10 वर्ष की वारंटी · IP65 · WiFi मॉनिटरिंग बिल्ट-इन",
    "quote.structure": "एलिवेटेड GI माउंटिंग स्ट्रक्चर",
    "quote.structureWarranty": "10 वर्ष एंटी-करोशन · छत लीक की गारंटी नहीं",
    "quote.cabling": "DC + AC केबलिंग, ACDB और DCDB",
    "quote.cablingSpec": "IS-7098-2 केबल · IP65 एनक्लोजर · SPD और आइसोलेटर",
    "quote.earthing": "अर्थिंग, लाइटनिंग और सर्ज प्रोटेक्शन",
    "quote.earthingSpec": "कॉपर-बॉन्डेड इलेक्ट्रोड · टाइप-2 SPD · IS-3043 अनुपालन",
    "quote.paperwork": "सिंगल-विंडो पेपरवर्क",
    "quote.paperworkSpec": "PM सूर्य घर पंजीकरण · DISCOM नेट-मीटरिंग · लोन सुविधा",
    "quote.monitoring": "WiFi मॉनिटरिंग + WhatsApp बचत रिपोर्ट",
    "quote.monitoringSpec": "आपके फोन पर लाइव जेनरेशन और लाइफटाइम बचत",
    "quote.performancePromise": "परफॉर्मेंस प्रॉमिस",
    "quote.performanceSpec": "≥80% डिजाइन जेनरेशन की लिखित गारंटी",

    // Quote - AMC
    "quote.amcTitle": "5 वर्ष का AMC",
    "quote.amcSubtitle": "हम आपके साथ रहेंगे, ज्यादातर इंस्टॉलर कमीशनिंग के बाद गायब हो जाते हैं।",
    "quote.recommended": "अनुशंसित",
    "quote.years1to5": "वर्ष 1-5",
    "quote.amcFeatures": [
      "त्रैमासिक पैनल सफाई",
      "वार्षिक इन्वर्टर हेल्थ चेक",
      "अर्थिंग और लाइटनिंग ऑडिट",
      "मासिक WhatsApp बचत रिपोर्ट",
      "48 घंटे सर्विस रिस्पांस SLA"
    ],
    "quote.amcNote": "व्यापक AMC — सफाई, निगरानी और सेवा — {price} प्रति kW प्रति वर्ष पर। आपकी प्रणाली को पीक पर उत्पन्न करता रहता है और पहले दिन से हमारी देखभाल में रहता है।",

    // Quote - Payment
    "quote.paymentSchedule": "भुगतान अनुसूची",
    "quote.payAdvance": "हस्ताक्षर पर",
    "quote.payAdvanceNote": "PO की पुष्टि करता है और पैनल आवंटन लॉक करता है",
    "quote.payDispatch": "सामग्री डिस्पैच से पहले",
    "quote.payDispatchNote": "~दिन 5 एक बार डिजाइन + पेपरवर्क साइन ऑफ हो जाए",
    "quote.payCommission": "कमीशनिंग पर",
    "quote.payCommissionNote": "दिन 7-10 — नेट-मीटर लाइव, यूनिट जेनरेट हो रही हैं",
    "quote.total": "कुल",
    "quote.paymentMethod": "NEFT / RTGS / चेक SolarOS को",
    "quote.subsidyPaymentNote": "{amount} की PM सूर्य घर सब्सिडी नेट-मीटर एक्टिवेशन के ~30 दिन बाद आपके बैंक खाते में जमा होती है। हम पूरी फाइलिंग संभालते हैं — आप तीन फॉर्म साइन करें।",

    // Quote - Timeline
    "quote.timeline": "गो-अहेड से पहली यूनिट तक — 7 से 10 दिन",
    "quote.day": "दिन",
    "quote.siteSurvey": "साइट सर्वे",
    "quote.siteSurveyNote": "ड्रोन स्कैन, छाया विश्लेषण, संरचनात्मक जांच",
    "quote.designBOQ": "डिजाइन और BOQ",
    "quote.designBOQNote": "3-D लेआउट, सिंगल-लाइन डायग्राम, पैनल-लेवल लेआउट साझा किया गया",
    "quote.paperworkTimeline": "पेपरवर्क",
    "quote.paperworkTimelineNote": "PM सूर्य घर पंजीकरण, DISCOM आवेदन, लोन अगर चाहिए",
    "quote.installation": "स्थापना",
    "quote.installationNote": "माउंटिंग, पैनल, इन्वर्टर, केबल — हर घंटे WhatsApp पर फोटो भेजी जाती हैं",
    "quote.commissioning": "कमीशनिंग",
    "quote.commissioningNote": "DISCOM द्वारा नेट-मीटर स्थापित, मॉनिटरिंग ऐप एक्टिव, ट्रेनिंग",
    "quote.ongoing": "निरंतर सहायता",
    "quote.ongoingNote": "सफाई, निगरानी, मासिक बचत रिपोर्ट",

    // Quote - Terms
    "quote.terms": "शर्तें — संक्षिप्त और ईमानदार",
    "quote.termsValidity": "वैधता: यह कोटेशन जारी होने से {days} दिनों के लिए मान्य है।",
    "quote.termsGeneration": "उत्पादन: आंकड़े MNRE सोलर एटलस पर आधारित हैं; वास्तविक उपज ±5% मौसम, धूल, छाया पर निर्भर करती है।",
    "quote.termsSubsidy": "सब्सिडी: पूरी तरह से SolarOS द्वारा दायर। यदि CFA नेट-मीटर सक्रियण के 45 दिनों के भीतर जमा नहीं की जाती है, तो हम अंतिम इनवॉइस के उस हिस्से को माफ कर देंगे।",
    "quote.termsNetMetering": "नेट मीटरिंग: हम आपके DISCOM के साथ फाइल करते हैं; उनका द्वि-दिशात्मक मीटर स्थापना उनके शेड्यूल पर है (आमतौर पर हमारे आवेदन के 2-3 सप्ताह बाद)।",
    "quote.termsForceMajeure": "फोर्स मेजर: हम प्राकृतिक आपदा, सरकारी आदेश, या DISCOM देरी के कारण होने वाली देरी के लिए उत्तरदायी नहीं हैं।",
    "quote.termsJurisdiction": "न्यायाधिकार: दिल्ली / गुरुग्राम की अदालतें।",

    // Quote - CTA
    "quote.readyTitle": "इसे वास्तविक बनाने के लिए तैयार हैं?",
    "quote.readyText": "WhatsApp पर इस कोटेशन का जवाब दें या कॉल करें — हम 48 घंटों के भीतर साइट विजिट बुक करेंगे।",
    "quote.confirmWhatsApp": "WhatsApp पर पुष्टि करें",
    "quote.callUs": "हमें कॉल करें",

    // Quote - Footer
    "quote.additionalNotes": "अतिरिक्त नोट्स",
    "quote.poweredBy": "द्वारा संचालित",
    "quote.customerAcceptance": "ग्राहक स्वीकृति",
    "quote.nameAndDate": "नाम और तारीख",

    // Agreement - Header
    "agreement.title": "सोलर रूफटॉप स्थापना समझौता",
    "agreement.agreementNo": "समझौता नं.",
    "agreement.date": "तारीख",
    "agreement.system": "सिस्टम",
    "agreement.quoteRef": "कोटेशन संदर्भ",
    "agreement.between": "{firmName} और ग्राहक के बीच",

    // Agreement - Scope
    "agreement.scopeTitle": "SolarOS क्या प्रदान करता है",
    "agreement.scopeSubtitle": "टर्नकी स्कोप",
    "agreement.supplyInstall": "आपूर्ति और स्थापना",
    "agreement.supplyInstallNote": "सोलर पैनल, इन्वर्टर, माउंटिंग स्ट्रक्चर, केबलिंग, अर्थिंग और सुरक्षा घटक",
    "agreement.completeSiteWork": "पूर्ण साइट कार्य",
    "agreement.completeSiteWorkNote": "साइट सर्वे, स्थापना, परीक्षण और कमीशनिंग",
    "agreement.singleWindow": "सिंगल-विंडो पेपरवर्क",
    "agreement.singleWindowNote": "नेट-मीटरिंग आवेदन, DISCOM समन्वय, PM सूर्य घर सब्सिडी फाइलिंग (यदि पात्र)",
    "agreement.handoverPack": "हैंडओवर पैक",
    "agreement.handoverPackNote": "निर्माता वारंटी कार्ड (पैनल और इन्वर्टर), परीक्षण रिपोर्ट और उपयोगकर्ता मैनुअल",

    // Agreement - Equipment
    "agreement.equipmentTitle": "उपकरण — मेक, मॉडल और वारंटी",
    "agreement.component": "घटक",
    "agreement.make": "मेक",
    "agreement.model": "मॉडल",
    "agreement.warranty": "वारंटी",
    "agreement.solarPanels": "सोलर पैनल",
    "agreement.inverter": "इन्वर्टर",
    "agreement.acdb": "ACDB",
    "agreement.dcdb": "DCDB",
    "agreement.warrantyNote": "सभी विद्युत घटकों की वारंटी मेक और मॉडल द्वारा प्रदान की जाती है, और वारंटी कार्ड स्थापना से पहले सौंप दिए जाते हैं। निर्धारित वारंटी अवधि के बाद, मरम्मत या प्रतिस्थापन ग्राहक की लागत पर होता है।",

    // Agreement - Payment
    "agreement.paymentSchedule": "भुगतान अनुसूची",
    "agreement.payAdvance": "अग्रिम",
    "agreement.payAdvanceNote": "इस समझौते पर हस्ताक्षर करने पर",
    "agreement.payStructure": "संरचना और फिटिंग",
    "agreement.payStructureNote": "संरचना और पैनल फिट होने के बाद",
    "agreement.payNetMeter": "नेट मीटरिंग",
    "agreement.payNetMeterNote": "नेट-मीटरिंग पूरा होने के 3 दिनों के भीतर",

    // Agreement - AMC
    "agreement.amcTitle": "वार्षिक रखरखाव अनुबंध (AMC)",
    "agreement.amcSubtitle": "एक चुनें",
    "agreement.basicAMC": "बेसिक AMC",
    "agreement.basic": "बेसिक",
    "agreement.premiumAMC": "प्रीमियम AMC · अनुशंसित",
    "agreement.premium": "प्रीमियम",
    "agreement.basicFeatures": [
      "त्रैमासिक निरीक्षण (4/वर्ष)",
      "विद्युत और अर्थिंग जांच",
      "प्रदर्शन / उत्पादन रिपोर्ट",
      "प्राथमिकता सेवा और वारंटी-दावा सहायता"
    ],
    "agreement.premiumFeatures": [
      "बेसिक में सब कुछ, साथ ही:",
      "त्रैमासिक पैनल सफाई (4/वर्ष)",
      "एक मुफ्त सर्विस विजिट / वर्ष",
      "स्पेयर पार्ट्स पर 10% छूट"
    ],
    "agreement.amcWarning": "स्थापना कार्यकुशलता 12 महीनों के लिए वारंटीकृत है, केवल तब मान्य जब AMC सक्रिय हो। AMC के बिना, 12 महीनों के बाद SolarOS वारंटी, सेवा या सिस्टम प्रदर्शन के लिए जिम्मेदार नहीं है, और कोई भी विजिट अलग से चार्ज किया जाएगा।",

    // Agreement - Warranty
    "agreement.warrantyTitle": "वारंटी और दायित्व",
    "agreement.warrantySubtitle": "कृपया ध्यान से पढ़ें",
    "agreement.warrantyEquipment": "उपकरण (पैनल, इन्वर्टर, ACDB, DCDB): निर्माता द्वारा मेक/मॉडल के अनुसार कवर किया गया। वारंटी कार्ड स्थापना से पहले आपको दिए जाते हैं। दावे निर्माता के साथ किए जाते हैं। वारंटी अवधि के बाद, मरम्मत/प्रतिस्थापन ग्राहक की लागत पर है।",
    "agreement.warrantyInstallation": "स्थापना (कार्यकुशलता): {firmName} 12 महीनों के लिए कार्यकुशलता को कवर करता है — केवल तभी मान्य जब आप AMC लें।",
    "agreement.warrantyWithoutAMC": "AMC के बिना: 12 महीनों के बाद {firmName} वारंटी, सेवा या सिस्टम प्रदर्शन के लिए जिम्मेदार नहीं है। कोई भी विजिट अलग से चार्ज किया जाएगा।",
    "agreement.warrantyNotCovered": "कवर नहीं: प्राकृतिक आपदा, बिजली, आग, चोरी, लापरवाही या अनधिकृत परिवर्तनों से क्षति; वास्तविक बिल बचत और उत्पादन (सूर्य के प्रकाश, उपयोग, टैरिफ पर निर्भर); DISCOM देरी और सरकारी सब्सिडी समयसीमा/अनुमोदन।",
    "agreement.warrantyJurisdiction": "न्यायाधिकार: {city} की अदालतों का अधिकार क्षेत्र है। यह समझौता पूर्ण समझ है; परिवर्तन लिखित रूप में होना चाहिए, दोनों पक्षों द्वारा हस्ताक्षरित।",

    // Agreement - Footer
    "agreement.authorisedSignatory": "अधिकृत हस्ताक्षरकर्ता",
    "agreement.nameSignatureDate": "नाम, हस्ताक्षर और तारीख",
    "agreement.customerAcceptance": "ग्राहक स्वीकृति",
    "agreement.customerAck": "मैं पुष्टि करता/करती हूं कि मैंने इस समझौते को पढ़ा और समझा है, जिसमें यह शामिल है कि AMC के बिना, {firmName} 12 महीनों के बाद जिम्मेदार नहीं है।",
    "agreement.signedElectronically": "इलेक्ट्रॉनिक रूप से हस्ताक्षरित",
    "agreement.amcChosen": "AMC योजना चुनी गई:",
    "agreement.consentRecorded": "सहमति दर्ज की गई — ग्राहक ने ऊपर दी गई शर्तों को स्वीकार किया।",
    "agreement.noAMC": "कोई AMC नहीं",

    // Common
    "common.at": "पर",
    "common.current": "वर्तमान",
    "common.tariff": "टैरिफ"
  },

  ta: {
    // Quote - Header
    "quote.tagline": "பூஜ்ஜிய மின் கட்டணம். பூஜ்ஜிய உமிழ்வு.",
    "quote.title": "சூரிய கூரை மேற்கோள்",
    "quote.quoteNo": "மேற்கோள் எண்.",
    "quote.issued": "வெளியிடப்பட்டது",
    "quote.validTill": "செல்லுபடியாகும் தேதி",

    // Quote - Hero
    "quote.personalizedProposal": "தனிப்பயனாக்கப்பட்ட திட்டம்",
    "quote.residential": "குடியிருப்பு",
    "quote.commercial": "வணிக",
    "quote.industrial": "தொழில்",
    "quote.farm": "வேளாண் / பண்ணை",

    // Quote - Metrics
    "quote.systemSize": "அமைப்பு அளவு",
    "quote.monthlySavings": "மாத சேமிப்பு",
    "quote.generation": "உற்பத்தி",
    "quote.payback": "திரும்ப கிடைக்கும் காலம்",
    "quote.co2Avoided": "CO₂ சேமிப்பு",
    "quote.lifetimeSavings": "25 ஆண்டு நிகர சேமிப்பு",
    "quote.perMonth": "/மாதம்",
    "quote.perYear": "/ஆண்டு",
    "quote.years": "ஆண்டுகள்",
    "quote.thenFreePower": "பின்னர் 20+ ஆண்டுகள் இலவச மின்சாரம்",
    "quote.afterRecovering": "முதலீட்டை மீட்டபின்",
    "quote.treesEquivalent": "மரங்களுக்கு சமம்",

    // Quote - Commercial
    "quote.commercialSummary": "வணிக சுருக்கம்",
    "quote.item": "உருப்படி",
    "quote.calculation": "கணக்கீடு",
    "quote.amount": "தொகை",
    "quote.systemCostExGST": "அமைப்பு செலவு (GST தவிர்த்து)",
    "quote.gstAt": "GST @",
    "quote.totalProjectCost": "மொத்த திட்ட செலவு",
    "quote.inclusiveGST": "GST உட்பட",
    "quote.lessSubsidy": "குறைப்பு: PM சூரியா கார் மானியம்",
    "quote.subsidyNote": "நாங்கள் தாக்கல் செய்கிறோம், உங்கள் வங்கியில் நேரடியாக வரவு வைக்கப்படும்",
    "quote.yourInvestment": "உங்கள் முதலீடு",
    "quote.netOfSubsidy": "மானியத்திற்குப் பிறகு",
    "quote.noSubsidyApplied": "மானியம் பயன்படுத்தப்படவில்லை",

    // Quote - Footer
    "quote.additionalNotes": "கூடுதல் குறிப்புகள்",
    "quote.poweredBy": "இயக்குபவர்",
    "quote.customerAcceptance": "வாடிக்கையாளர் ஏற்பு",
    "quote.nameAndDate": "பெயர் மற்றும் தேதி",

    // Agreement - Header
    "agreement.title": "சூரிய கூரை நிறுவல் ஒப்பந்தம்",
    "agreement.agreementNo": "ஒப்பந்த எண்.",
    "agreement.date": "தேதி",
    "agreement.system": "அமைப்பு",
    "agreement.quoteRef": "மேற்கோள் குறிப்பு",
    "agreement.between": "{firmName} மற்றும் வாடிக்கையாளர் இடையே",

    // Common
    "common.at": "இல்",
    "common.current": "தற்போதைய",
    "common.tariff": "கட்டணம்"
  },

  kn: {
    // Quote - Header
    "quote.tagline": "ಶೂನ್ಯ ಬಿಲ್ಲುಗಳು. ಶೂನ್ಯ ಹೊರಸೂಸುವಿಕೆ.",
    "quote.title": "ಸೌರ ಛಾವಣಿ ಉದ್ಧರಣ",
    "quote.quoteNo": "ಉದ್ಧರಣ ಸಂ.",
    "quote.issued": "ಹೊರಡಿಸಲಾಗಿದೆ",
    "quote.validTill": "ಮಾನ್ಯ ತಿಥಿ",

    // Quote - Hero
    "quote.personalizedProposal": "ವೈಯಕ್ತಿಕಗೊಳಿಸಿದ ಪ್ರಸ್ತಾವನೆ",
    "quote.residential": "ವಸತಿ",
    "quote.commercial": "ವಾಣಿಜ್ಯ",
    "quote.industrial": "ಕೈಗಾರಿಕಾ",
    "quote.farm": "ಕೃಷಿ / ಜಮೀನು",

    // Quote - Metrics
    "quote.systemSize": "ವ್ಯವಸ್ಥೆಯ ಗಾತ್ರ",
    "quote.monthlySavings": "ಮಾಸಿಕ ಉಳಿತಾಯ",
    "quote.generation": "ಉತ್ಪಾದನೆ",
    "quote.payback": "ಮರುಪಾವತಿ ಕಾಲಾವಧಿ",
    "quote.co2Avoided": "CO₂ ತಪ್ಪಿಸಿದೆ",
    "quote.lifetimeSavings": "25 ವರ್ಷಗಳ ನಿವ್ವಳ ಉಳಿತಾಯ",
    "quote.perMonth": "/ತಿಂಗಳು",
    "quote.perYear": "/ವರ್ಷ",
    "quote.years": "ವರ್ಷಗಳು",
    "quote.thenFreePower": "ನಂತರ 20+ ವರ್ಷಗಳ ಉಚಿತ ವಿದ್ಯುತ್",
    "quote.afterRecovering": "ಹೂಡಿಕೆ ಚೇತರಿಸಿಕೊಂಡ ನಂತರ",
    "quote.treesEquivalent": "ಮರಗಳಿಗೆ ಸಮಾನ",

    // Quote - Footer
    "quote.additionalNotes": "ಹೆಚ್ಚುವರಿ ಟಿಪ್ಪಣಿಗಳು",
    "quote.poweredBy": "ಚಾಲಿತ",
    "quote.customerAcceptance": "ಗ್ರಾಹಕ ಸ್ವೀಕಾರ",
    "quote.nameAndDate": "ಹೆಸರು ಮತ್ತು ದಿನಾಂಕ",

    // Agreement - Header
    "agreement.title": "ಸೌರ ಛಾವಣಿ ಸ್ಥಾಪನೆ ಒಪ್ಪಂದ",
    "agreement.agreementNo": "ಒಪ್ಪಂದ ಸಂ.",
    "agreement.date": "ದಿನಾಂಕ",
    "agreement.system": "ವ್ಯವಸ್ಥೆ",
    "agreement.quoteRef": "ಉದ್ಧರಣ ಉಲ್ಲೇಖ",
    "agreement.between": "{firmName} ಮತ್ತು ಗ್ರಾಹಕರ ನಡುವೆ",

    // Common
    "common.at": "ನಲ್ಲಿ",
    "common.current": "ಪ್ರಸ್ತುತ",
    "common.tariff": "ದರ"
  },

  te: {
    // Quote - Header
    "quote.tagline": "సున్నా బిల్లులు. సున్నా ఉద్గారాలు.",
    "quote.title": "సోలార్ రూఫ్‌టాప్ కోట్",
    "quote.quoteNo": "కోట్ నం.",
    "quote.issued": "జారీ చేయబడింది",
    "quote.validTill": "చెల్లుబాటు తేదీ",

    // Quote - Hero
    "quote.personalizedProposal": "వ్యక్తిగతీకరించిన ప్రతిపాదన",
    "quote.residential": "నివాస",
    "quote.commercial": "వాణిజ్య",
    "quote.industrial": "పారిశ్రామిక",
    "quote.farm": "వ్యవసాయ / పొలం",

    // Quote - Footer
    "quote.additionalNotes": "అదనపు గమనికలు",
    "quote.poweredBy": "శక్తివంతం",
    "quote.customerAcceptance": "కస్టమర్ అంగీకారం",
    "quote.nameAndDate": "పేరు మరియు తేదీ",

    // Agreement - Header
    "agreement.title": "సోలార్ రూఫ్‌టాప్ ఇన్‌స్టాలేషన్ ఒప్పందం",
    "agreement.agreementNo": "ఒప్పందం నం.",
    "agreement.date": "తేదీ",
    "agreement.system": "వ్యవస్థ",
    "agreement.quoteRef": "కోట్ సూచన",
    "agreement.between": "{firmName} మరియు కస్టమర్ మధ్య"
  },

  bn: {
    // Quote - Header
    "quote.tagline": "শূন্য বিল। শূন্য নির্গমন।",
    "quote.title": "সোলার রুফটপ কোটেশন",
    "quote.quoteNo": "কোটেশন নং।",
    "quote.issued": "জারি করা হয়েছে",
    "quote.validTill": "বৈধ তারিখ",

    // Quote - Hero
    "quote.personalizedProposal": "ব্যক্তিগতকৃত প্রস্তাব",
    "quote.residential": "আবাসিক",
    "quote.commercial": "বাণিজ্যিক",
    "quote.industrial": "শিল্প",
    "quote.farm": "কৃষি / খামার",

    // Quote - Footer
    "quote.additionalNotes": "অতিরিক্ত নোট",
    "quote.poweredBy": "দ্বারা চালিত",
    "quote.customerAcceptance": "গ্রাহক স্বীকৃতি",
    "quote.nameAndDate": "নাম ও তারিখ",

    // Agreement - Header
    "agreement.title": "সোলার রুফটপ ইনস্টলেশন চুক্তি",
    "agreement.agreementNo": "চুক্তি নং।",
    "agreement.date": "তারিখ",
    "agreement.system": "সিস্টেম",
    "agreement.quoteRef": "কোটেশন রেফারেন্স",
    "agreement.between": "{firmName} এবং গ্রাহকের মধ্যে"
  },

  mr: {
    // Quote - Header
    "quote.tagline": "शून्य बिल. शून्य उत्सर्जन.",
    "quote.title": "सोलर रूफटॉप कोटेशन",
    "quote.quoteNo": "कोटेशन क्र.",
    "quote.issued": "जारी केले",
    "quote.validTill": "वैध तारीख",

    // Quote - Hero
    "quote.personalizedProposal": "वैयक्तिक प्रस्ताव",
    "quote.residential": "निवासी",
    "quote.commercial": "व्यावसायिक",
    "quote.industrial": "औद्योगिक",
    "quote.farm": "शेती / शेत",

    // Quote - Footer
    "quote.additionalNotes": "अतिरिक्त नोट्स",
    "quote.poweredBy": "द्वारे समर्थित",
    "quote.customerAcceptance": "ग्राहक स्वीकृती",
    "quote.nameAndDate": "नाव आणि तारीख",

    // Agreement - Header
    "agreement.title": "सोलर रूफटॉप इंस्टॉलेशन करार",
    "agreement.agreementNo": "करार क्र.",
    "agreement.date": "तारीख",
    "agreement.system": "प्रणाली",
    "agreement.quoteRef": "कोटेशन संदर्भ",
    "agreement.between": "{firmName} आणि ग्राहक दरम्यान"
  },

  gu: {
    // Quote - Header
    "quote.tagline": "શૂન્ય બિલ. શૂન્ય ઉત્સર્જન.",
    "quote.title": "સોલર રૂફટોપ કોટેશન",
    "quote.quoteNo": "કોટેશન નં.",
    "quote.issued": "જારી કર્યું",
    "quote.validTill": "માન્ય તારીખ",

    // Quote - Hero
    "quote.personalizedProposal": "વ્યક્તિગત પ્રસ્તાવ",
    "quote.residential": "રહેણાંક",
    "quote.commercial": "વ્યાપારી",
    "quote.industrial": "ઔદ્યોગિક",
    "quote.farm": "ખેતી / ખેતર",

    // Quote - Footer
    "quote.additionalNotes": "વધારાની નોંધો",
    "quote.poweredBy": "દ્વારા સંચાલિત",
    "quote.customerAcceptance": "ગ્રાહક સ્વીકૃતિ",
    "quote.nameAndDate": "નામ અને તારીખ",

    // Agreement - Header
    "agreement.title": "સોલર રૂફટોપ ઇન્સ્ટોલેશન કરાર",
    "agreement.agreementNo": "કરાર નં.",
    "agreement.date": "તારીખ",
    "agreement.system": "સિસ્ટમ",
    "agreement.quoteRef": "કોટેશન સંદર્ભ",
    "agreement.between": "{firmName} અને ગ્રાહક વચ્ચે"
  },

  ml: {
    // Quote - Header
    "quote.tagline": "പൂജ്യം ബില്ലുകൾ. പൂജ്യം ഉദ്വമനം.",
    "quote.title": "സോളാർ റൂഫ്ടോപ്പ് ക്വട്ടേഷൻ",
    "quote.quoteNo": "ക്വട്ടേഷൻ നമ്പർ.",
    "quote.issued": "പുറത്തിറക്കിയത്",
    "quote.validTill": "സാധുവായ തീയതി",

    // Quote - Hero
    "quote.personalizedProposal": "വ്യക്തിഗത നിർദ്ദേശം",
    "quote.residential": "റസിഡൻഷ്യൽ",
    "quote.commercial": "വാണിജ്യ",
    "quote.industrial": "വ്യാവസായിക",
    "quote.farm": "കാർഷിക / ഫാം",

    // Quote - Footer
    "quote.additionalNotes": "അധിക കുറിപ്പുകൾ",
    "quote.poweredBy": "പവർ ചെയ്തത്",
    "quote.customerAcceptance": "ഉപഭോക്തൃ സ്വീകാര്യത",
    "quote.nameAndDate": "പേരും തീയതിയും",

    // Agreement - Header
    "agreement.title": "സോളാർ റൂഫ്ടോപ്പ് ഇൻസ്റ്റലേഷൻ കരാർ",
    "agreement.agreementNo": "കരാർ നമ്പർ.",
    "agreement.date": "തീയതി",
    "agreement.system": "സിസ്റ്റം",
    "agreement.quoteRef": "ക്വട്ടേഷൻ റഫറൻസ്",
    "agreement.between": "{firmName} ഉം ഉപഭോക്താവും തമ്മിൽ"
  }
};

// Translation function
function translate(key, lang = 'en', replacements = {}) {
  const translations = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  let text = translations[key] || TRANSLATIONS['en'][key] || key;

  // Replace placeholders like {firmName}, {amount}, etc.
  Object.keys(replacements).forEach(placeholder => {
    text = text.replace(`{${placeholder}}`, replacements[placeholder]);
  });

  return text;
}

// Get available languages
function getAvailableLanguages() {
  return [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' }
  ];
}

// Currency formatter with Indian numbering system
const formatters = {
  inr: (n, lang = 'en') => {
    if (!isFinite(n) || n == null) return translate('common.currency', lang) + '0';
    const sign = n < 0 ? '-' : '';
    n = Math.round(Math.abs(n));
    const s = n.toString();
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    return sign + '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3);
  },

  inrShort: (n, lang = 'en') => {
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
    return formatters.inr(n, lang);
  }
};

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { translate, getAvailableLanguages, formatters, TRANSLATIONS };
} else {
  window.translate = translate;
  window.getAvailableLanguages = getAvailableLanguages;
  window.translationFormatters = formatters;
  window.TRANSLATIONS = TRANSLATIONS;
}
