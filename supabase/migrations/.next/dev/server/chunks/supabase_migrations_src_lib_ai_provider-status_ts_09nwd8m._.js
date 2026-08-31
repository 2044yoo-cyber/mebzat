module.exports = [
"[project]/supabase/migrations/src/lib/ai/provider-status.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PROVIDER_STATUS",
    ()=>PROVIDER_STATUS,
    "isTransient",
    ()=>isTransient,
    "isUsable",
    ()=>isUsable,
    "needsOperator",
    ()=>needsOperator
]);
const PROVIDER_STATUS = {
    connected: {
        label: "Connected",
        mark: "ok",
        fix: null
    },
    missing_key: {
        label: "Missing API Key",
        mark: "fail",
        fix: "Set the environment variable in .env.local and restart."
    },
    invalid_key: {
        label: "Invalid API Key",
        mark: "fail",
        fix: "The key was rejected. Copy it again from the provider's dashboard — keys are often truncated on paste."
    },
    no_access: {
        label: "No Access",
        mark: "fail",
        fix: "The key works but the account is not entitled to this model. Some providers gate image models behind a verified or paid account."
    },
    quota_exceeded: {
        label: "Quota Exceeded",
        mark: "fail",
        fix: "The account is out of credit or past its allowance. Top it up, or use a provider with a free tier."
    },
    rate_limited: {
        label: "Rate Limited",
        mark: "warn",
        fix: "Too many requests just now. This clears by itself — the chain will use it again once it does."
    },
    model_unavailable: {
        label: "Model Unavailable",
        mark: "warn",
        fix: "The provider does not recognise that model. It may have been renamed or retired."
    },
    network_error: {
        label: "Network Error",
        mark: "fail",
        fix: "The host could not be reached. Check the server's outbound network, or the URL if this is a self-hosted provider."
    },
    provider_down: {
        label: "Provider Unavailable",
        mark: "warn",
        fix: "The provider is having problems at their end. Nothing to fix here; the chain will route around it."
    },
    unchecked: {
        label: "Not checked yet",
        mark: "idle",
        fix: null
    }
};
function isUsable(status) {
    return status === "connected";
}
function isTransient(status) {
    return status === "rate_limited" || status === "provider_down" || status === "network_error";
}
function needsOperator(status) {
    return status === "missing_key" || status === "invalid_key" || status === "no_access" || status === "quota_exceeded";
}
}),
];

//# sourceMappingURL=supabase_migrations_src_lib_ai_provider-status_ts_09nwd8m._.js.map