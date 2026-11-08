/**
 * Trust experience renderer.
 *
 * All content comes from trust-demo.data.js. This file only owns structure,
 * interaction and animation. The demo flag is resolved in trust-demo.config.js.
 */

import trustDemoData from "./trust-demo.data.js";
import { getDemoTrustState } from "./trust-demo.config.js";

const demoState = getDemoTrustState();
const sections = Array.from(document.querySelectorAll("[data-trust-demo-section]"));

if (!demoState.enabled) {
  document.documentElement.dataset.trustDemo = "off";
  sections.forEach((section) => section.remove());
} else {
  document.documentElement.dataset.trustDemo = "on";
  // Defer until module constants (STAR_PATH, icons) below are initialised.
  queueMicrotask(init);
}

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const reviewsSection = document.querySelector("#reviews");
  const trustSection = document.querySelector("#trust");

  if (reviewsSection) {
    const root = reviewsSection.querySelector("[data-trust-reviews-root]");
    if (root) root.innerHTML = reviewsMarkup(trustDemoData);
    reviewsSection.hidden = false;
    initTestimonialCarousel(reviewsSection, trustDemoData.testimonials.items, reduceMotion);
    initReveal(reviewsSection);
    initCounters(reviewsSection, reduceMotion);
    syncInterfaceColor(reviewsSection, "cream", "dark", "reviews");
  }

  if (trustSection) {
    const root = trustSection.querySelector("[data-trust-trustpilot-root]");
    if (root) root.innerHTML = trustpilotMarkup(trustDemoData);
    trustSection.hidden = false;
    initReveal(trustSection);
    initCounters(trustSection, reduceMotion);
    initSatisfactionRing(trustSection, trustDemoData.satisfaction.score, reduceMotion);
    initTrustActions(trustDemoData);
    syncInterfaceColor(trustSection, "dark", "cream", "trust");
  }
}

/* --------------------------------------------------------------------------
   Markup helpers
   -------------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

const STAR_PATH =
  "M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z";

function starIcon(className = "td-star") {
  return `<svg class="${className}__base" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
}

function starsMarkup(rating, className = "td-stars") {
  const safeRating = Math.max(0, Math.min(5, Number(rating) || 0));
  const stars = Array.from({ length: 5 }, (_, index) => {
    const fill = Math.max(0, Math.min(1, safeRating - index)) * 100;
    return `<span class="td-star" style="--star-fill:${fill}%">
      <svg class="td-star__base" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
      <span class="td-star__filled" aria-hidden="true">
        <svg class="td-star__filled-svg" viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg>
      </span>
    </span>`;
  }).join("");

  return `<span class="${className}" role="img" aria-label="${safeRating.toFixed(1)} out of 5 stars">${stars}</span>`;
}

function avatarMarkup(person, size = "md", extraStyle = "") {
  const avatar = person.avatar || {};
  const from = avatar.from || "#ff7a59";
  const to = avatar.to || "#ffb38a";
  const ink = avatar.ink || "#2a120a";
  const initials = person.initials || initialsFromName(person.name);
  return `<span class="td-avatar td-avatar--${size}" style="--avatar-from:${escapeHtml(from)};--avatar-to:${escapeHtml(to)};--avatar-ink:${escapeHtml(ink)};${extraStyle}" aria-hidden="true">
    <span class="td-avatar__sheen"></span>
    <span class="td-avatar__initials">${escapeHtml(initials)}</span>
  </span>`;
}

function initialsFromName(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function quoteMark() {
  return `<svg class="td-quote-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M13.4 38.5c-4.7 0-8.2-3.4-8.2-8.4 0-7.9 5.7-15.9 13.8-20.4l2.7 4.1c-5.1 3.2-8.7 7.5-9.4 11.4 1-.5 2.2-.8 3.5-.8 3.9 0 6.8 2.8 6.8 6.7 0 4.2-3.4 7.4-9.2 7.4Zm21.7 0c-4.7 0-8.2-3.4-8.2-8.4 0-7.9 5.7-15.9 13.8-20.4l2.7 4.1c-5.1 3.2-8.7 7.5-9.4 11.4 1-.5 2.2-.8 3.5-.8 3.9 0 6.8 2.8 6.8 6.7 0 4.2-3.4 7.4-9.2 7.4Z"/></svg>`;
}

function trustpilotLogo() {
  return `<span class="td-tp-logo">
    <svg class="td-tp-logo__star" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
    <span class="td-tp-logo__word">Trustpilot</span>
  </span>`;
}

function logoMark(mark) {
  const marks = {
    square: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"/><path d="M9 15.5 15.5 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`,
    wave: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5c3.2-6.2 6.5-6.2 9.4 0 2.9 6.2 6.2 6.2 9.4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    pulse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.1-6 4.1 12 2.2-7H21" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    diamond: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12l-9 9-9-9 9-9Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="8" r="2.1"/><circle cx="17" cy="8" r="2.1"/><circle cx="12" cy="16" r="2.1"/></svg>`,
  };
  return marks[mark] || marks.square;
}

function icon(name) {
  const icons = {
    arrowLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-7-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" fill="currentColor"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.9 8 7 10 4.1-2 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2.1 2.1L15.5 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5L10 13l-6.5-2L10 9l2-6.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5.4l3.5 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.3 4.3L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    thumb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10v10H4V10h4Zm0 9h8.3a2 2 0 0 0 2-1.7l1-5A2 2 0 0 0 17.3 10H14V6a2 2 0 0 0-2-2l-4 6v9Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    arrowUpRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 8.2v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };
  return icons[name] || "";
}

function demoChip(label) {
  return `<span class="td-demo-chip"><span class="td-demo-chip__dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

/* --------------------------------------------------------------------------
   Testimonials markup
   -------------------------------------------------------------------------- */

function reviewsMarkup(data) {
  const testimonials = data.testimonials;
  const items = testimonials.items;

  return `
    <div class="td-reviews__ambient" aria-hidden="true">
      <span class="td-reviews__glow td-reviews__glow--one"></span>
      <span class="td-reviews__glow td-reviews__glow--two"></span>
      <span class="td-reviews__grid"></span>
    </div>

    <div class="td-shell">
      <header class="td-reviews__header td-reveal">
        <div class="td-kicker">
          ${demoChip(testimonials.label)}
        </div>

        <div class="td-reviews__headline-row">
          <h2 class="td-display" id="td-reviews-title">${testimonials.title}</h2>

          <div class="td-reviews__intro">
            <p class="td-reviews__lead">${escapeHtml(testimonials.lead)}</p>

            <div class="td-reviews__summary">
              <div class="td-reviews__summary-score">
                <span class="td-reviews__score">${testimonials.score.toFixed(1)}</span>
                <div class="td-reviews__summary-stars">
                  ${starsMarkup(testimonials.score)}
                  <span>${escapeHtml(testimonials.scoreLabel)}</span>
                </div>
              </div>
              <div class="td-reviews__avatar-stack" aria-hidden="true">
                ${items
                  .slice(0, 4)
                  .map((item, index) => avatarMarkup(item, "sm", `--stack-index:${index};`))
                  .join("")}
                <span class="td-reviews__avatar-count">+${Math.max(0, 24 - 4)}</span>
              </div>
            </div>

            <p class="td-reviews__proof">${escapeHtml(testimonials.proofLine)}</p>
          </div>
        </div>
      </header>

      <div class="td-carousel td-reveal" data-testimonial-carousel role="region" aria-roledescription="carousel" aria-label="Sample client testimonials">
        <article class="td-testimonial" data-testimonial-card>
          <div class="td-testimonial__top">
            <div class="td-testimonial__rating" data-testimonial-stars></div>
            <div class="td-testimonial__meta">
              <span class="td-mini-chip">Sample story</span>
              <span class="td-testimonial__date" data-testimonial-date></span>
            </div>
          </div>

          <blockquote class="td-testimonial__quote">
            <p data-testimonial-quote></p>
          </blockquote>

          <footer class="td-testimonial__footer">
            <div class="td-author" data-testimonial-author></div>
            <div class="td-project" data-testimonial-project></div>
          </footer>

          <span class="td-testimonial__watermark" aria-hidden="true">${quoteMark()}</span>
        </article>

        <aside class="td-carousel__side">
          <div class="td-carousel__side-top">
            <span class="td-eyebrow-label">Selected story</span>
            <span class="td-carousel__counter">
              <strong data-carousel-current>01</strong>
              <span>/ ${String(items.length).padStart(2, "0")}</span>
            </span>
          </div>

          <div class="td-carousel__rail" role="group" aria-label="Choose a client story">
            ${items
              .map(
                (item, index) => `
              <button
                class="td-carousel__person"
                type="button"
                data-carousel-index="${index}"
                aria-pressed="${index === 0 ? "true" : "false"}"
              >
                ${avatarMarkup(item, "xs")}
                <span class="td-carousel__person-copy">
                  <span class="td-carousel__person-name">${escapeHtml(item.name)}</span>
                  <span class="td-carousel__person-company">${escapeHtml(item.company)}</span>
                </span>
                <span class="td-carousel__person-index">${String(index + 1).padStart(2, "0")}</span>
              </button>`
              )
              .join("")}
          </div>

          <div class="td-carousel__bottom">
            <div class="td-carousel__controls">
              <button class="td-icon-button" type="button" data-carousel-prev aria-label="Previous client story">
                ${icon("arrowLeft")}
              </button>
              <button class="td-icon-button" type="button" data-carousel-next aria-label="Next client story">
                ${icon("arrowRight")}
              </button>
              <button class="td-icon-button td-icon-button--subtle" type="button" data-carousel-toggle aria-label="Pause automatic rotation">
                ${icon("pause")}
              </button>
            </div>
            <div class="td-carousel__progress" aria-hidden="true">
              <span data-carousel-progress></span>
            </div>
            <p class="td-carousel__hint">Use ← → to browse</p>
          </div>
        </aside>
      </div>

      <section class="td-logos td-reveal" aria-labelledby="td-logos-title">
        <div class="td-section-head">
          <div>
            <span class="td-eyebrow-label">Selected collaborations</span>
            <h3 class="td-section-title" id="td-logos-title">Teams behind the work</h3>
          </div>
        </div>
        <div class="td-logos__wall">
          ${data.logos
            .map(
              (logo) => `
            <div class="td-logo td-logo--${escapeHtml(logo.style)}">
              <span class="td-logo__mark">${logoMark(logo.mark)}</span>
              <span class="td-logo__word">${escapeHtml(logo.name)}</span>
              ${logo.suffix ? `<span class="td-logo__suffix">${escapeHtml(logo.suffix)}</span>` : ""}
            </div>`
            )
            .join("")}
        </div>
      </section>

      <section class="td-metrics td-reveal" aria-labelledby="td-metrics-title">
        <div class="td-metrics__head">
          <span class="td-eyebrow-label">Proof at a glance</span>
          <h3 class="td-section-title" id="td-metrics-title">The shape of the partnership</h3>
          <p>Every number in this strip is demonstration data, animated to preview the finished experience.</p>
        </div>
        <div class="td-metrics__grid" data-count-group>
          ${data.metrics
            .map(
              (metric, index) => `
            <div class="td-metric" style="--index:${index}">
              <span class="td-metric__value">
                <span
                  data-count-to="${metric.value}"
                  data-count-decimals="${metric.decimals || 0}"
                  data-count-suffix="${escapeHtml(metric.suffix)}"
                  aria-hidden="true"
                >${escapeHtml(`${metric.value.toFixed(metric.decimals || 0)}${metric.suffix}`)}</span>
              </span>
              <span class="td-metric__label">${escapeHtml(metric.label)}</span>
              <span class="td-metric__detail">${escapeHtml(metric.detail)}</span>
            </div>`
            )
            .join("")}
        </div>
      </section>

      <section class="td-outcomes td-reveal" aria-labelledby="td-outcomes-title">
        <div class="td-section-head">
          <div>
            <span class="td-eyebrow-label">Project feedback</span>
            <h3 class="td-section-title" id="td-outcomes-title">What changed after launch</h3>
          </div>
          <span class="td-section-note">Illustrative outcomes tied to fictional projects</span>
        </div>
        <div class="td-outcomes__grid">
          ${data.outcomes
            .map(
              (outcome) => `
            <article class="td-outcome" style="--outcome-accent:${escapeHtml(outcome.accent)}">
              <div class="td-outcome__top">
                <span class="td-outcome__project">${escapeHtml(outcome.project)}</span>
                <span class="td-mini-chip">Sample outcome</span>
              </div>
              <div class="td-outcome__metric">${escapeHtml(outcome.metric)}</div>
              <p class="td-outcome__label">${escapeHtml(outcome.label)}</p>
              <p class="td-outcome__copy">${escapeHtml(outcome.copy)}</p>
              <span class="td-outcome__rule" aria-hidden="true"></span>
            </article>`
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Trustpilot preview markup
   -------------------------------------------------------------------------- */

function trustpilotMarkup(data) {
  const trustpilot = data.trustpilot;

  return `
    <div class="td-tp__ambient" aria-hidden="true">
      <span class="td-tp__glow"></span>
      <span class="td-tp__star td-tp__star--one"></span>
      <span class="td-tp__star td-tp__star--two"></span>
    </div>

    <div class="td-shell">
      <header class="td-tp__header td-reveal">
        <div class="td-kicker">
          ${demoChip(data.meta.label)}
        </div>
        <h2 class="td-display td-tp__title" id="td-trustpilot-title">A rating that lives <em>outside our website.</em></h2>
      </header>

      <div class="td-tp__panel td-reveal" data-count-group>
        <aside class="td-tp__summary" aria-label="Sample Trustpilot rating summary">
          <div class="td-tp__brand-row">
            ${trustpilotLogo()}
            <span class="td-tp__preview-chip">Preview</span>
          </div>

          <div class="td-tp__score-row">
            <div class="td-tp__score-box">
              <span class="td-tp__score" data-tp-score>${trustpilot.score.toFixed(1)}</span>
              <span class="td-tp__score-max">/ 5</span>
            </div>
            <div class="td-tp__score-copy">
              <span class="td-tp__excellent">${escapeHtml(trustpilot.excellentLabel)}</span>
              ${starsMarkup(trustpilot.score)}
              <span class="td-tp__based-on">${escapeHtml(trustpilot.basedOn)}</span>
            </div>
          </div>

          <div class="td-tp__distribution" aria-label="Sample star distribution">
            ${trustpilot.distribution
              .map(
                (row) => `
              <div class="td-tp__distribution-row">
                <span class="td-tp__distribution-label">${row.stars} star</span>
                <span class="td-tp__bar"><span class="td-tp__bar-fill" style="--bar-value:${row.percent}%"></span></span>
                <span class="td-tp__distribution-count">${row.count}</span>
              </div>`
              )
              .join("")}
          </div>

          <div class="td-tp__highlights">
            ${trustpilot.highlights
              .map(
                (highlight) => `
              <div class="td-tp__highlight">
                <span class="td-tp__highlight-label">${escapeHtml(highlight.label)}</span>
                <span class="td-tp__highlight-value">${highlight.value.toFixed(1)}</span>
                <span class="td-tp__bar td-tp__bar--small"><span class="td-tp__bar-fill" style="--bar-value:${highlight.percent}%"></span></span>
              </div>`
              )
              .join("")}
          </div>

          <div class="td-tp__meta">
            <span>${escapeHtml(trustpilot.updated)}</span>
            <span>${escapeHtml(trustpilot.responseRate)}</span>
          </div>
        </aside>

        <div class="td-tp__reviews">
          <div class="td-tp__reviews-head">
            <div>
              <span class="td-eyebrow-label">Recent reviews</span>
              <h3 class="td-section-title">What a public profile could feel like</h3>
            </div>
            <span class="td-tp__reviews-count">Showing 4 of ${trustpilot.reviewCount}</span>
          </div>

          <div class="td-tp__review-grid">
            ${trustpilot.reviews
              .map(
                (review, index) => `
              <article class="td-tp__review" style="--index:${index}">
                <div class="td-tp__review-top">
                  <span class="td-tp__sample-chip">Sample review</span>
                  <span class="td-tp__review-date">${escapeHtml(review.date)}</span>
                </div>
                ${starsMarkup(review.rating)}
                <h4 class="td-tp__review-title">${escapeHtml(review.title)}</h4>
                <p class="td-tp__review-text">${escapeHtml(review.text)}</p>
                <footer class="td-tp__review-footer">
                  <div class="td-author td-author--small">
                    ${avatarMarkup(review, "sm")}
                    <div>
                      <span class="td-author__name">${escapeHtml(review.name)}</span>
                      <span class="td-author__role">${escapeHtml(review.role)}, ${escapeHtml(review.company)}</span>
                    </div>
                  </div>
                  <span class="td-tp__helpful" title="Fictional helpful count">${icon("thumb")}<span>${review.helpful}</span></span>
                </footer>
              </article>`
              )
              .join("")}
          </div>

          <div class="td-tp__actions">
            <button class="td-button" type="button" data-trust-demo-cta>
              <span>View all ${trustpilot.reviewCount} reviews</span>
              ${icon("arrowUpRight")}
            </button>
            <button class="td-text-button" type="button" data-trust-open-policy>How review data would work</button>
          </div>
        </div>
      </div>

      <section class="td-satisfaction td-reveal" aria-labelledby="td-satisfaction-title">
        <div class="td-satisfaction__ring-card">
          <div class="td-ring" data-sat-ring style="--progress:${data.satisfaction.score}">
            <span class="td-ring__inner">
              <span class="td-ring__value"><span data-sat-score>${data.satisfaction.score}</span><small>%</small></span>
              <span class="td-ring__label">${escapeHtml(data.satisfaction.label)}</span>
            </span>
          </div>
          <div class="td-satisfaction__ring-copy">
            <span class="td-eyebrow-label" id="td-satisfaction-title">Customer satisfaction</span>
            <p>${escapeHtml(data.satisfaction.note)}. A single visual for how sentiment could be summarised beside the review feed.</p>
          </div>
        </div>

        <div class="td-satisfaction__bars">
          ${data.satisfaction.stats
            .map(
              (stat) => `
            <div class="td-satisfaction__stat">
              <div class="td-satisfaction__stat-head">
                <span>${escapeHtml(stat.label)}</span>
                <strong>${stat.value}%</strong>
              </div>
              <span class="td-tp__bar"><span class="td-tp__bar-fill" style="--bar-value:${stat.value}%"></span></span>
            </div>`
            )
            .join("")}
        </div>

        <div class="td-satisfaction__note">
          <span class="td-eyebrow-label">What this shows</span>
          <p>Public reviews, private satisfaction and project outcomes can sit together without pretending that one number tells the whole story.</p>
        </div>
      </section>

      <section class="td-credibility td-reveal" aria-labelledby="td-credibility-title">
        <div class="td-section-head">
          <div>
            <span class="td-eyebrow-label">Trust, with conditions</span>
            <h3 class="td-section-title" id="td-credibility-title">What makes a review worth trusting</h3>
          </div>
          <button class="td-text-button" type="button" data-trust-open-policy>Read the review policy</button>
        </div>
        <div class="td-credibility__grid">
          ${data.credibility
            .map(
              (item, index) => `
            <article class="td-credibility__card">
              <span class="td-credibility__index">0${index + 1}</span>
              <span class="td-credibility__icon" aria-hidden="true">${icon(item.icon)}</span>
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(item.text)}</p>
            </article>`
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Interactions
   -------------------------------------------------------------------------- */

function initTestimonialCarousel(section, items, reduceMotion) {
  const root = section.querySelector("[data-testimonial-carousel]");
  if (!root) return;

  const card = root.querySelector("[data-testimonial-card]");
  const quoteEl = root.querySelector("[data-testimonial-quote]");
  const starsEl = root.querySelector("[data-testimonial-stars]");
  const dateEl = root.querySelector("[data-testimonial-date]");
  const authorEl = root.querySelector("[data-testimonial-author]");
  const projectEl = root.querySelector("[data-testimonial-project]");
  const currentEl = root.querySelector("[data-carousel-current]");
  const progressEl = root.querySelector("[data-carousel-progress]");
  const railButtons = Array.from(root.querySelectorAll("[data-carousel-index]"));
  const prevButton = root.querySelector("[data-carousel-prev]");
  const nextButton = root.querySelector("[data-carousel-next]");
  const toggleButton = root.querySelector("[data-carousel-toggle]");
  const hint = root.querySelector(".td-carousel__hint");

  if (!card || !quoteEl || !items.length) return;

  let index = 0;
  let autoTimer = null;
  let isPlaying = !reduceMotion;
  let isHovering = false;
  let hasFocus = false;
  let isInView = !("IntersectionObserver" in window);

  card.id = "td-testimonial-panel";
  quoteEl.id = "td-testimonial-quote";
  card.setAttribute("aria-labelledby", "td-testimonial-quote");

  const render = (animate = true) => {
    const item = items[index];

    starsEl.innerHTML = starsMarkup(item.rating);
    dateEl.textContent = item.date;
    quoteEl.textContent = `“${item.quote}”`;
    authorEl.innerHTML = `${avatarMarkup(item, "md")}
      <div class="td-author__copy">
        <span class="td-author__name">${escapeHtml(item.name)}</span>
        <span class="td-author__role">${escapeHtml(item.role)}, ${escapeHtml(item.company)}</span>
      </div>`;
    projectEl.innerHTML = `<span class="td-project__dot" style="--project-accent:${escapeHtml(item.avatar.from)}" aria-hidden="true"></span>
      <span class="td-project__name">${escapeHtml(item.project)}</span>
      <span class="td-project__divider" aria-hidden="true">/</span>
      <span class="td-project__discipline">${escapeHtml(item.discipline)}</span>`;

    currentEl.textContent = String(index + 1).padStart(2, "0");
    progressEl.style.width = `${((index + 1) / items.length) * 100}%`;

    railButtons.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === index;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (animate && !reduceMotion) {
      card.animate(
        [
          { opacity: 0.35, transform: "translateY(14px) scale(0.995)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
      quoteEl.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
  };

  const restartTimer = () => {
    window.clearInterval(autoTimer);
    autoTimer = null;
    if (!isPlaying || reduceMotion || isHovering || hasFocus || !isInView) return;
    autoTimer = window.setInterval(() => {
      index = (index + 1) % items.length;
      render();
    }, 8000);
  };

  if ("IntersectionObserver" in window) {
    const viewObserver = new IntersectionObserver(
      (entries) => {
        isInView = entries.some((entry) => entry.isIntersecting);
        restartTimer();
      },
      { threshold: 0.2 }
    );
    viewObserver.observe(root);
  }

  const goTo = (nextIndex, userInitiated = true) => {
    index = (nextIndex + items.length) % items.length;
    render();
    if (userInitiated) restartTimer();
  };

  const updateToggle = () => {
    if (!toggleButton) return;
    toggleButton.innerHTML = isPlaying ? icon("pause") : icon("play");
    toggleButton.setAttribute(
      "aria-label",
      isPlaying ? "Pause automatic rotation" : "Play automatic rotation"
    );
    toggleButton.setAttribute("aria-pressed", String(!isPlaying));
    if (hint) {
      hint.textContent = reduceMotion
        ? "Use ← → to browse"
        : isPlaying
          ? "Auto-playing · use ← → to browse"
          : "Paused · use ← → to browse";
    }
  };

  prevButton?.addEventListener("click", () => goTo(index - 1));
  nextButton?.addEventListener("click", () => goTo(index + 1));

  toggleButton?.addEventListener("click", () => {
    isPlaying = !isPlaying;
    updateToggle();
    restartTimer();
  });

  railButtons.forEach((button) => {
    button.addEventListener("click", () => goTo(Number(button.dataset.carouselIndex)));
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    }
  });

  root.addEventListener("pointerenter", () => {
    isHovering = true;
    restartTimer();
  });
  root.addEventListener("pointerleave", () => {
    isHovering = false;
    restartTimer();
  });
  root.addEventListener("focusin", () => {
    hasFocus = true;
    restartTimer();
  });
  root.addEventListener("focusout", () => {
    hasFocus = false;
    restartTimer();
  });

  if (reduceMotion && toggleButton) {
    // The timer deliberately never starts under reduced motion; hide the
    // control rather than offering a play button that cannot do anything.
    toggleButton.hidden = true;
  }

  render(false);
  updateToggle();
  restartTimer();
}

function initReveal(section) {
  if (!section) return;
  const elements = Array.from(section.querySelectorAll(".td-reveal"));
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        section.classList.add("is-inview");
        elements.forEach((element, index) => {
          element.style.setProperty("--reveal-index", String(Math.min(index, 6)));
        });
        observer.disconnect();
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
  );

  observer.observe(section);
}

function initCounters(section, reduceMotion) {
  const counters = Array.from(section.querySelectorAll("[data-count-to]"));
  const score = section.querySelector("[data-tp-score]");

  if (reduceMotion) {
    counters.forEach((el) => setCounterFinal(el));
    if (score) score.textContent = trustDemoData.trustpilot.score.toFixed(1);
    return;
  }

  if (score) {
    // Observe the compact score row rather than the tall panel: on small
    // screens a quarter of the panel can sit below the fold for a long time.
    const scoreGroup = score.closest(".td-tp__score-row") || score;
    observeOnce(scoreGroup, () => {
      animateNumber(score, {
        from: 4,
        to: trustDemoData.trustpilot.score,
        decimals: 1,
        duration: 900,
      });
    });
  }

  if (counters.length) {
    const counterGroup = counters[0].closest("[data-count-group]") || section;
    observeOnce(counterGroup, () => {
      counters.forEach((el, index) => {
        const to = Number(el.dataset.countTo) || 0;
        const decimals = Number(el.dataset.countDecimals) || 0;
        const suffix = el.dataset.countSuffix || "";
        window.setTimeout(() => {
          animateNumber(el, { to, decimals, suffix, duration: 1500 - index * 90 });
        }, index * 110);
      });
    });
  }

  // The metric values were initially rendered as "0" plus suffix; give each
  // number an accessible final label even before animation runs.
  counters.forEach((el) => setCounterFinalLabel(el));
  if (score) score.setAttribute("aria-label", `${trustDemoData.trustpilot.score} out of 5`);
}

function initSatisfactionRing(section, target, reduceMotion) {
  const ring = section.querySelector("[data-sat-ring]");
  const valueEl = section.querySelector("[data-sat-score]");
  if (!ring || !valueEl) return;

  const setRing = (value) => {
    ring.style.setProperty("--progress", String(value));
    valueEl.textContent = String(Math.round(value));
  };

  if (reduceMotion) {
    setRing(target);
    return;
  }

  observeOnce(ring, () => {
    const start = performance.now();
    const duration = 1500;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setRing(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function syncInterfaceColor(section, colorInView, colorWhenAbove, fixedClass) {
  if (!section) return;
  const fixedClassName = `td-interface--${fixedClass}`;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.body.dataset.interfaceColor = colorInView;
          document.body.classList.add(fixedClassName);
        } else {
          // Only pin the interface colours while this chapter actually owns
          // the reading band. Otherwise a stale class from the previous
          // chapter would fight the header colours of the next one.
          document.body.classList.remove(fixedClassName);
          if (entry.boundingClientRect.top > 0) {
            document.body.dataset.interfaceColor = colorWhenAbove;
          }
        }
      });
    },
    { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
  );
  observer.observe(section);
}

function observeOnce(element, callback) {
  if (!element) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { threshold: 0.25 }
  );
  observer.observe(element);
}

function animateNumber(element, { from = 0, to, decimals = 0, suffix = "", duration = 1400 }) {
  const finalLabel = `${to.toFixed(decimals)}${suffix}`;
  const startValue = Number(from) || 0;
  element.setAttribute("aria-label", finalLabel);
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = startValue + (to - startValue) * eased;
    element.textContent = `${value.toFixed(decimals)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
    else element.textContent = finalLabel;
  };
  requestAnimationFrame(tick);
}

function setCounterFinal(el) {
  const to = Number(el.dataset.countTo) || 0;
  const decimals = Number(el.dataset.countDecimals) || 0;
  const suffix = el.dataset.countSuffix || "";
  el.textContent = `${to.toFixed(decimals)}${suffix}`;
  el.setAttribute("aria-label", `${to.toFixed(decimals)}${suffix}`);
}

function setCounterFinalLabel(el) {
  const to = Number(el.dataset.countTo) || 0;
  const decimals = Number(el.dataset.countDecimals) || 0;
  const suffix = el.dataset.countSuffix || "";
  el.setAttribute("aria-label", `${to.toFixed(decimals)}${suffix}`);
}

function initTrustActions(data) {
  const cta = document.querySelector("[data-trust-demo-cta]");
  const policyButtons = Array.from(document.querySelectorAll("[data-trust-open-policy]"));

  let toast = document.querySelector(".td-toast");
  let toastTimer = null;

  const showToast = (message) => {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "td-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4600);
  };

  cta?.addEventListener("click", () => {
    showToast("Demo mode — all 128 reviews are fictional. Connect a live Trustpilot profile to publish real reviews.");
  });

  const dialog = document.createElement("dialog");
  dialog.className = "td-dialog";
  dialog.id = "td-review-policy";
  dialog.setAttribute("aria-labelledby", "td-review-policy-title");
  dialog.setAttribute("aria-describedby", "td-review-policy-intro");
  dialog.innerHTML = `
    <div class="td-dialog__panel">
      <div class="td-dialog__head">
        <span class="td-demo-chip"><span class="td-demo-chip__dot" aria-hidden="true"></span>${escapeHtml(data.meta.previewLabel)}</span>
        <button class="td-dialog__close" type="button" aria-label="Close review policy">${icon("close")}</button>
      </div>
      <h2 class="td-dialog__title" id="td-review-policy-title">${escapeHtml(data.policy.title)}</h2>
      <p class="td-dialog__intro" id="td-review-policy-intro">${escapeHtml(data.policy.intro)}</p>
      <ul class="td-dialog__list">
        ${data.policy.points.map((point) => `<li>${icon("check")}<span>${escapeHtml(point)}</span></li>`).join("")}
      </ul>
    </div>
  `;
  document.body.append(dialog);

  const closeDialog = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  policyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  });

  dialog.querySelector(".td-dialog__close")?.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
}
