"use strict";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

let paymentMethodDomainPromise = null;

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getStripeCheckoutPaymentMethodTypes(env = process.env) {
  const configured = normalizeString(env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES, 500);
  if (!configured) return [];

  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function applyStripeCheckoutPaymentOptions(options = {}, env = process.env) {
  const paymentMethodTypes = getStripeCheckoutPaymentMethodTypes(env);
  if (paymentMethodTypes.length === 0) return { ...options };

  return {
    ...options,
    payment_method_types: paymentMethodTypes,
  };
}

function resolveStripePaymentMethodDomain({ env = process.env, siteOrigin = "" } = {}) {
  const rawDomain = normalizeString(env.STRIPE_PAYMENT_METHOD_DOMAIN, 255);
  const candidate = rawDomain || normalizeString(siteOrigin, 500);
  if (!candidate) return "";

  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || LOCAL_HOSTNAMES.has(hostname)) return "";
    return hostname;
  } catch {
    const hostname = candidate
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .split(":")[0]
      .trim()
      .toLowerCase();
    if (!hostname || LOCAL_HOSTNAMES.has(hostname)) return "";
    return hostname;
  }
}

function isDuplicatePaymentMethodDomainError(error) {
  const code = normalizeString(error && error.code, 120).toLowerCase();
  const message = normalizeString(error && error.message, 500).toLowerCase();
  return (
    code === "resource_already_exists" ||
    message.includes("already exists") ||
    message.includes("has already been registered")
  );
}

async function ensureStripePaymentMethodDomain(stripe, options = {}) {
  const { env = process.env, siteOrigin = "" } = options;
  if (normalizeString(env.STRIPE_REGISTER_PAYMENT_METHOD_DOMAIN, 20) === "0") {
    return { ok: true, skipped: "disabled" };
  }

  const domainName = resolveStripePaymentMethodDomain({ env, siteOrigin });
  if (!stripe || !domainName) {
    return { ok: true, skipped: "missing-domain" };
  }

  const domainsApi = stripe.paymentMethodDomains;
  if (!domainsApi || typeof domainsApi.create !== "function") {
    return { ok: true, skipped: "unsupported-stripe-client" };
  }

  if (!paymentMethodDomainPromise) {
    paymentMethodDomainPromise = (async () => {
      try {
        if (typeof domainsApi.list === "function") {
          const existing = await domainsApi.list({ domain_name: domainName, limit: 1 });
          const domains = Array.isArray(existing && existing.data) ? existing.data : [];
          const match = domains.find((domain) => {
            return normalizeString(domain && domain.domain_name, 255).toLowerCase() === domainName;
          });
          if (match) {
            if (match.enabled === false && typeof domainsApi.update === "function" && match.id) {
              await domainsApi.update(match.id, { enabled: true });
              return { ok: true, domainName, updated: true };
            }
            return { ok: true, domainName, skipped: "exists" };
          }
        }

        await domainsApi.create({ domain_name: domainName, enabled: true });
        return { ok: true, domainName, created: true };
      } catch (error) {
        if (isDuplicatePaymentMethodDomainError(error)) {
          return { ok: true, domainName, skipped: "exists" };
        }
        return {
          ok: false,
          domainName,
          code: normalizeString(error && error.code, 120) || "STRIPE_PAYMENT_METHOD_DOMAIN_FAILED",
          message: normalizeString(error && error.message, 300),
        };
      }
    })();
  }

  const result = await paymentMethodDomainPromise;
  if (!result || result.ok !== true) {
    paymentMethodDomainPromise = null;
  }
  return result;
}

function resetStripePaymentMethodDomainCacheForTests() {
  paymentMethodDomainPromise = null;
}

module.exports = {
  applyStripeCheckoutPaymentOptions,
  ensureStripePaymentMethodDomain,
  getStripeCheckoutPaymentMethodTypes,
  resetStripePaymentMethodDomainCacheForTests,
  resolveStripePaymentMethodDomain,
};
