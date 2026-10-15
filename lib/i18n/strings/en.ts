// path: lib/i18n/strings/en.ts

/**
 * Centralized user-facing strings. All product copy lives here so the
 * English-only rule has one auditable source and a future translation layer
 * can slot in key-for-key. Key names are stable contracts.
 */
export const strings = {
  brand: {
    name: "KD SOLUTION IT",
    shortName: "KD",
    tagline: "Invoicing, payments, payroll, and accounting in one secure platform.",
    logoLabel: "KD SOLUTION IT home",
  },
  metadata: {
    titleTemplate: "%s | KD SOLUTION IT",
    defaultTitle: "KD SOLUTION IT - Secure business operations platform",
    defaultDescription:
      "KD SOLUTION IT is a multi-tenant platform for invoicing, payments, payroll, accounting, and business operations, with English-only product surfaces and USD accounting.",
    openGraphAlt: "KD SOLUTION IT - secure business operations platform",
  },
  actions: {
    retry: "Try again",
    cancel: "Cancel",
    close: "Close",
    clear: "Clear",
    apply: "Apply",
    reset: "Reset",
    previous: "Previous",
    next: "Next",
    search: "Search",
    backToHome: "Back to home",
    removeTag: "Remove",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleSidebar: "Toggle sidebar",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    toggleTheme: "Change color theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    openCommandPalette: "Open command palette",
    reportError: "Report this error",
    contactSupport: "Contact support",
  },
  states: {
    loading: {
      title: "Loading content",
      description: "Please wait while the latest information loads.",
    },
    error: {
      title: "Something went wrong",
      description:
        "The request could not be completed. Your data is safe. Try again, and contact support if the problem continues.",
      correlationLabel: "Reference",
      reportSubjectPrefix: "Error report",
      reportBodyIntro: "Describe what you were doing when this error appeared:",
    },
    empty: {
      title: "Nothing here yet",
      description: "Once there is something to show, it will appear here.",
    },
    emptyFiltered: {
      title: "No results found",
      description: "No entries match the current filters. Adjust the filters and try again.",
    },
    noAccess: {
      title: "No access",
      description: "Your account does not have permission to view this content.",
    },
    success: {
      title: "Done",
      description: "The action completed successfully.",
    },
  },
  offline: {
    title: "You are offline",
    description: "Changes you make now will not be saved until your connection returns.",
  },
  notFound: {
    title: "This page does not exist",
    description: "The link may be outdated or the address may contain a mistake.",
    searchLabel: "Search the site",
    searchPlaceholder: "Type a page name",
    noResults: "No pages match your search.",
    homeLinkLabel: "Go to the home page",
  },
  commandPalette: {
    triggerLabel: "Search or run a command",
    dialogLabel: "Command palette",
    inputPlaceholder: "Type a command or search for a page",
    emptyResults: "No results match your search.",
    pagesGroup: "Pages",
    actionsGroup: "Actions",
    toggleThemeAction: "Switch color theme",
    copySupportEmailAction: "Copy support email address",
    copiedConfirmation: "Email address copied to the clipboard.",
    copyFailed: "Copying is not available in this browser.",
    openHint: "Open",
    closeHint: "Close",
  },
  shortcuts: {
    title: "Keyboard shortcuts",
    description: "Every action in the platform is reachable from the keyboard.",
    openPaletteLabel: "Open the command palette",
    openShortcutsLabel: "Show keyboard shortcuts",
    dismissLabel: "Close dialogs and menus",
    navigationLabel: "Move through navigation",
    activateLabel: "Activate the focused element",
  },
  shell: {
    skipToContent: "Skip to content",
    mainNavigation: "Main navigation",
    primaryNavigation: "Primary navigation",
    breadcrumbLabel: "Breadcrumb",
    topbarLabel: "Top bar",
    userMenuLabel: "Account menu",
    signedOutTitle: "Not signed in",
    signedOutDescription: "Authentication is delivered in Step 03 of the implementation plan.",
    emptyNavigationTitle: "No modules registered",
    emptyNavigationDescription:
      "Product modules register their routes with the navigation map as their implementation steps are completed.",
    securePortalBadge: "Secure document access",
    accountSettings: "Settings",
    signOut: "Sign out",
    portalFooterNote:
      "This area is reached through a private link. Do not forward it to anyone else.",
    offlineBannerRole: "status",
  },
  authShell: {
    panelTitle: "One platform for the whole business",
    panelDescription:
      "Secure sign-in protects invoicing, payments, payroll, and accounting for every tenant.",
    bullets: [
      "Provider-neutral payment processing",
      "Encrypted file storage on every plan",
      "Audit-ready approvals on every change",
    ],
    backToSite: "Back to the home page",
  },
  footer: {
    resourcesHeading: "Resources",
    productHeading: "Product",
    supportHeading: "Support",
    supportLinkLabel: "Email the support team",
    designSystemLinkLabel: "Design system",
    homeLinkLabel: "Home",
    versionLabel: "Version",
    copyrightSymbol: "\u00A9",
    rightsNotice: "All rights reserved.",
  },
  header: {
    primaryCtaLabel: "Email the team",
    navigationLabel: "Site navigation",
  },
  home: {
    eyebrow: "Enterprise business operations",
    title: "Invoicing, payments, payroll, and accounting in one secure platform.",
    subtitle:
      "KD SOLUTION IT is a multi-tenant platform for running a service business end to end: professional documents, provider-neutral payments, encrypted files, and audit-ready approvals, with English-only product surfaces and USD accounting.",
    primaryCta: "Explore the design system",
    secondaryCta: "Email the team",
    pillarsTitle: "Built on a verifiable foundation",
    pillarsIntro:
      "The platform is delivered in sixteen verified steps. Step 01 establishes the shared foundation below; product modules activate as their steps are completed.",
    pillars: [
      {
        title: "Security first",
        description:
          "Zero Trust boundaries, nonce-based content security, structured logging with redaction, and least-privilege access are built into the foundation rather than retrofitted.",
      },
      {
        title: "Exact USD money",
        description:
          "Monetary values cross every boundary as fixed-scale decimal strings and persist as numeric(18,4), so invoices, payroll, and ledgers never lose precision.",
      },
      {
        title: "Multi-tenant by design",
        description:
          "Every record is tenant-scoped with default-deny isolation, and every file is encrypted before it reaches the selected storage provider.",
      },
      {
        title: "Accessible for everyone",
        description:
          "WCAG 2.1 AA guides every component: keyboard-first navigation, visible focus, dark and high-contrast themes, and reduced-motion support.",
      },
    ],
    statusTitle: "Delivery status",
    statusBody:
      "Step 01 of 16 is delivered: repository foundation, design system, and the shared application shell. The design system reference shows every shared component working with real states.",
  },
  designSystem: {
    title: "Design system",
    description:
      "Reference implementation of the KD SOLUTION IT tokens, primitives, page states, and layout contracts owned by Step 01. Every control on this page is functional.",
    tocTitle: "On this page",
    sections: {
      tokens: "Design tokens",
      colors: "Color",
      typography: "Typography",
      spacing: "Spacing",
      radius: "Radius",
      shadow: "Shadow",
      elevation: "Elevation (z-index)",
      motionTokens: "Motion tokens",
      buttons: "Buttons and badges",
      forms: "Form fields",
      feedback: "Feedback states",
      dataDisplay: "Data display",
      overlays: "Overlays and menus",
      navigation: "Navigation and command",
      charts: "Charts",
      motionPrimitives: "Motion primitives",
      shells: "Layout contracts",
    },
    formDemo: {
      title: "Live validation",
      description:
        "Fields validate on blur and on submit with the same Zod schema shared by client and server.",
      nameLabel: "Full name",
      namePlaceholder: "Jordan Reyes",
      nameTooShort: "Enter at least 2 characters.",
      emailLabel: "Work email",
      emailPlaceholder: "jordan@example.com",
      submitLabel: "Validate details",
      successTitle: "Details are valid",
      successDescription:
        "The form submitted through the shared schema without a server round trip.",
      toastMessage: "Form validated successfully.",
    },
    errorDemo: {
      title: "Retryable failure",
      description:
        "This preview simulates a failed request. Pressing retry runs the request again and recovers.",
      recoveredLabel: "The request recovered.",
    },
    tableDemo: {
      caption: "Spacing tokens with filter and pagination",
      filterLabel: "Filter tokens",
      filterPlaceholder: "Filter by token name",
      tokenColumn: "Token",
      pixelsColumn: "Pixels",
      remColumn: "REM",
      exampleColumn: "Example",
    },
    chartDemo: {
      title: "Token count by group",
      description: "Bar chart computed live from config/design-tokens.ts.",
      xAxisLabel: "Token group",
      yAxisLabel: "Tokens",
    },
    shellDemo: {
      appShellTitle: "Application shell (dashboard and admin)",
      authShellTitle: "Authentication shell",
      portalShellTitle: "Token portal shell",
      previewNote:
        "Layouts are rendered here as scaled previews. Their routes are registered by the steps that own the product pages.",
    },
  },
  health: {
    statusOk: "ok",
  },
  dataPlane: {
    approvals: {
      title: "Command approvals",
      subtitle:
        "Privileged changes are staged here and execute only after the full approval chain.",
      statusProposed: "Awaiting review",
      statusAwaitingL2: "Awaiting Level 2 approval",
      statusAwaitingL3: "Awaiting final approval",
      statusAwaitingConfirmation: "Awaiting final confirmation",
      statusApproved: "Approved, ready to execute",
      statusExecuted: "Executed",
      statusRejected: "Rejected",
      statusExpired: "Expired",
      statusCancelled: "Cancelled",
      dualControlBadge: "Dual-control",
      executeConfirm: "Execute",
      rejectLabel: "Reject with reason",
      expiredHint: "This request expired without execution.",
    },
    files: {
      title: "Encrypted files",
      subtitle: "Every stored file is encrypted before leaving this platform.",
      storageProviderDrive: "Google Drive",
      storageProviderSupabase: "Supabase Storage",
      quarantineClean: "Verified",
      quarantinePending: "Scanning",
      quarantineQuarantined: "Held for review",
      quarantineReleased: "Released from review",
      migrationStable: "Stable",
      migrationMigrating: "Migrating between providers",
      migrationRetaining: "Retaining old copy",
      overQuota: "The workspace storage quota is exhausted.",
      duplicateNotice: "This file already exists in the workspace; the existing copy was reused.",
    },
    storage: {
      connectionsTitle: "Storage connections",
      healthHealthy: "Healthy",
      healthDegraded: "Degraded",
      healthUnhealthy: "Unavailable",
      noHealthyProvider: "File storage is temporarily unavailable.",
      retentionBanner:
        "The previous provider copy is retained for 30 days, then removed automatically.",
    },
    queues: {
      deadLetterTitle: "Dead-lettered jobs",
      deadLetterEmpty: "No jobs require operator attention.",
    },
  },
} as const;

export type Strings = typeof strings;
