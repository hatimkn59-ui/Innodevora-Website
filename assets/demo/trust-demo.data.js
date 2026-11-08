/**
 * =============================================================================
 *  INNODEVORA — TRUST EXPERIENCE DEMO DATA
 * =============================================================================
 *  Everything shown in the testimonial and Trustpilot-style preview sections
 *  is defined here. Names, companies, quotes, ratings, counts and outcomes are
 *  FICTIONAL demonstration content. They are not verified customer evidence.
 *
 *  To replace the preview with real content:
 *    1. Edit or replace this object with data from your review source.
 *    2. Set VITE_SHOW_DEMO_TRUST=false (or use ?demoTrust=0 locally).
 *    3. Remove the "demo" flags / badges from the renderer once real reviews are
 *       connected and legally cleared for publication.
 *
 *  The renderer never concatenates data into raw HTML without escaping, so this
 *  file is also safe to populate from an API later.
 * =============================================================================
 */

export const trustDemoData = {
  meta: {
    label: "INDEPENDENT PROOF",
    previewLabel: "Design preview",
    updated: "November 2026",
  },

  testimonials: {
    label: "05 CLIENT STORIES",
    title: "Trust, in their <em>own words.</em>",
    lead:
      "Five perspectives from founders, product leads and creative directors who trusted us with work that mattered.",
    score: 4.9,
    scoreLabel: "Average across 24 fictional engagements",
    proofLine: "Sample stories · Sample ratings · Real layout",
    items: [
      {
        id: "cartway",
        name: "Marie Laurent",
        role: "VP Product",
        company: "Cartway",
        initials: "ML",
        avatar: { from: "#ff7a59", to: "#ffb38a", ink: "#3c160b" },
        project: "Commerce reimagined",
        discipline: "Product & experience",
        rating: 5,
        date: "March 2026",
        quote:
          "Innodevora didn’t just redesign our storefront they rebuilt how our team thinks about the customer journey. Every interaction now has a reason to exist, and the numbers followed. Six months in, conversion is up 34% and the site finally feels like the product we’ve been describing in decks for years.",
      },
      {
        id: "aether",
        name: "Thomas Berg",
        role: "Founder",
        company: "Aether Studio",
        initials: "TB",
        avatar: { from: "#4776ff", to: "#9ac4ff", ink: "#0a1a45" },
        project: "A brand with a pulse",
        discipline: "Brand experience",
        rating: 5,
        date: "January 2026",
        quote:
          "Rare to find a partner who can hold the big picture and obsess over a 2px detail in the same conversation. That balance is why we came back for a second project.",
      },
      {
        id: "mirage",
        name: "Sofia Andersson",
        role: "Chief Technology Officer",
        company: "Mirage Labs",
        initials: "SA",
        avatar: { from: "#9b7cff", to: "#e0c9ff", ink: "#241244" },
        project: "The platform, explained",
        discipline: "SaaS platform",
        rating: 5,
        date: "November 2025",
        quote:
          "Our platform was powerful and impossible to explain. They found the story, then built an interface that makes it feel obvious. Activation is up, support tickets are down, and our sales team finally has a demo they’re proud of.",
      },
      {
        id: "pulse",
        name: "James Chen",
        role: "Creative Director",
        company: "Pulse Festival",
        initials: "JC",
        avatar: { from: "#f6c177", to: "#ff9d5c", ink: "#3a1d08" },
        project: "A world you could feel",
        discipline: "Event experience",
        rating: 5,
        date: "September 2023",
        quote:
          "The launch felt less like a website and more like a world. The motion, the sound, the way it all holds together on a phone people kept sending it to each other. That’s the metric I care about.",
      },
      {
        id: "ornate",
        name: "Elena Rossi",
        role: "Brand Director",
        company: "Ornate",
        initials: "ER",
        avatar: { from: "#e86c9a", to: "#ffb8cf", ink: "#431324" },
        project: "A story, sharpened",
        discipline: "Identity & art direction",
        rating: 5,
        date: "June 2022",
        quote:
          "They ask better questions than most studios I’ve worked with. Before a single pixel, we had a clearer idea of who we are. The identity they built has made every touchpoint, from packaging to social, feel like it belongs to the same story.",
      },
    ],
  },

  logos: [
    { name: "Cartway", style: "grotesk", mark: "square" },
    { name: "Aether", suffix: "Studio", style: "caps", mark: "star" },
    { name: "Mirage", style: "italic", mark: "wave" },
    { name: "Pulse", suffix: "Festival", style: "bold", mark: "pulse" },
    { name: "Ornate", style: "serif", mark: "diamond" },
    { name: "Maë", style: "light", mark: "dots" },
  ],

  metrics: [
    { value: 24, suffix: "+", label: "Projects delivered", detail: "Across brand, product and web" },
    { value: 98, suffix: "%", label: "Client satisfaction", detail: "Illustrative preview score" },
    { value: 4.9, suffix: "/5", decimals: 1, label: "Average rating", detail: "From the sample stories above" },
    { value: 12, suffix: "", label: "Countries reached", detail: "Teams and audiences worldwide" },
  ],

  outcomes: [
    {
      project: "Cartway",
      metric: "+34%",
      label: "checkout conversion",
      copy: "A rebuilt commerce journey that made the next step obvious.",
      accent: "#ff7a59",
      initials: "ML",
    },
    {
      project: "Pulse Festival",
      metric: "2.4×",
      label: "ticket-page engagement",
      copy: "A launch world people explored, shared and came back to.",
      accent: "#f6c177",
      initials: "JC",
    },
    {
      project: "Mirage Labs",
      metric: "−41%",
      label: "onboarding drop-off",
      copy: "A product story that turned complexity into momentum.",
      accent: "#9b7cff",
      initials: "SA",
    },
  ],

  trustpilot: {
    brand: "Trustpilot",
    score: 4.8,
    reviewCount: 128,
    excellentLabel: "Excellent",
    basedOn: "Based on 128 sample reviews",
    updated: "Updated November 2026",
    responseRate: "98% response rate",
    distribution: [
      { stars: 5, count: 104, percent: 81 },
      { stars: 4, count: 17, percent: 13 },
      { stars: 3, count: 4, percent: 3 },
      { stars: 2, count: 2, percent: 2 },
      { stars: 1, count: 1, percent: 1 },
    ],
    highlights: [
      { label: "Quality", value: 4.9, percent: 98 },
      { label: "Delivery", value: 4.8, percent: 96 },
      { label: "Value", value: 4.7, percent: 94 },
    ],
    reviews: [
      {
        id: "camille",
        title: "A launch that finally matched the ambition.",
        text:
          "Our new site finally feels like the product we’ve been describing for years. Fast, confident and full of small details that make the experience feel considered. The team was calm, direct and genuinely invested from kickoff to launch.",
        name: "Camille Moreau",
        role: "Founder",
        company: "Atelier North",
        initials: "CM",
        avatar: { from: "#ff7a59", to: "#ffb38a", ink: "#3c160b" },
        rating: 5,
        date: "12 March 2026",
        sample: true,
        helpful: 18,
      },
      {
        id: "daniel",
        title: "Clear thinking, beautiful craft, zero drama.",
        text:
          "We came in with a complicated brief and a tight timeline. Innodevora found the sharpest version of the story and delivered it without the usual agency noise. The handover was as thoughtful as the design.",
        name: "Daniel Okafor",
        role: "Head of Growth",
        company: "Cartway",
        initials: "DO",
        avatar: { from: "#4776ff", to: "#9ac4ff", ink: "#0a1a45" },
        rating: 5,
        date: "28 February 2026",
        sample: true,
        helpful: 11,
      },
      {
        id: "priya",
        title: "They listened first — then over-delivered.",
        text:
          "The best collaborations feel easy, even when the work is hard. They asked better questions, challenged the right assumptions and made every review feel like progress.",
        name: "Priya Nair",
        role: "Marketing Director",
        company: "Pulse Festival",
        initials: "PN",
        avatar: { from: "#f6c177", to: "#ff9d5c", ink: "#3a1d08" },
        rating: 5,
        date: "6 February 2026",
        sample: true,
        helpful: 9,
      },
      {
        id: "lucas",
        title: "A partner, not a vendor.",
        text:
          "A rare mix of taste and technical depth. Our platform is easier to explain, easier to demo and simply more enjoyable to use. We’d work with them again without hesitation.",
        name: "Lucas Meyer",
        role: "CEO",
        company: "Mirage Labs",
        initials: "LM",
        avatar: { from: "#9b7cff", to: "#e0c9ff", ink: "#241244" },
        rating: 5,
        date: "19 January 2026",
        sample: true,
        helpful: 7,
      },
    ],
  },

  satisfaction: {
    score: 98,
    label: "Would recommend",
    note: "Illustrative satisfaction score",
    stats: [
      { label: "On-time delivery", value: 96 },
      { label: "Brief-to-launch clarity", value: 94 },
    ],
  },

  credibility: [
    {
      icon: "shield",
      title: "Independent by design",
      text: "Real reviews should live on a neutral platform, collected outside the site rather than curated here.",
    },
    {
      icon: "spark",
      title: "No incentives, ever",
      text: "No discounts, gifts or credits would be offered in exchange for a rating or a quote.",
    },
    {
      icon: "clock",
      title: "After the work",
      text: "Review requests would go out after launch, when there is real work to evaluate — not during the pitch.",
    },
  ],

  policy: {
    title: "How the review layer is meant to work",
    intro:
      "Before any real review is published, the following rules apply:",
    points: [
      "Only feedback from a completed, identifiable project is eligible.",
      "Reviews are collected through a neutral platform, not typed by the studio.",
      "No incentive, discount or gift is offered in exchange for a rating.",
      "Ratings and review counts are refreshed from the source, never hand-edited for display.",
      "A client can ask for their review to be corrected or removed at any time.",
    ],
  },
};

export default trustDemoData;
