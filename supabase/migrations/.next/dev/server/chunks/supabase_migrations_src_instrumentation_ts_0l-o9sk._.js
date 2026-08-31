module.exports = [
"[project]/supabase/migrations/src/instrumentation.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Server startup.
 *
 * Image provider keys are validated here rather than on the first generation,
 * so a rejected key is a line in the boot log and a red row in the provider
 * manager — not something a user discovers by waiting through a fallback chain
 * that was never going to work.
 *
 * Deliberately not awaited by anything: a slow or unreachable provider must
 * not hold up the server coming online. The result lands in the health
 * registry whenever it arrives, and anything that needs it sooner will find a
 * probe already in flight and wait on that one.
 */ __turbopack_context__.s([
    "register",
    ()=>register
]);
async function register() {
    // Edge and the client bundle have no keys and no reason to probe.
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const { validateAll } = await __turbopack_context__.A("[project]/supabase/migrations/src/lib/ai/provider-health.ts [instrumentation] (ecmascript, async loader)");
    const { IMAGE_PROVIDERS } = await __turbopack_context__.A("[project]/supabase/migrations/src/lib/ai/image-models.ts [instrumentation] (ecmascript, async loader)");
    const { isUsable, PROVIDER_STATUS } = await __turbopack_context__.A("[project]/supabase/migrations/src/lib/ai/provider-status.ts [instrumentation] (ecmascript, async loader)");
    void validateAll({
        force: true
    }).then((health)=>{
        const ok = health.filter((entry)=>isUsable(entry.status));
        const configured = health.filter((entry)=>entry.status !== "missing_key");
        for (const entry of configured){
            const label = IMAGE_PROVIDERS[entry.provider].label;
            const status = PROVIDER_STATUS[entry.status].label;
            const mark = isUsable(entry.status) ? "✓" : "✗";
            console.log(`[medosha-ai] ${mark} ${label}: ${status}${entry.reason && !isUsable(entry.status) ? ` — ${entry.reason}` : ""}`);
        }
        if (configured.length === 0) {
            console.log("[medosha-ai] No image provider configured. Set FAL_KEY, TOGETHER_API_KEY or HUGGINGFACE_API_KEY in .env.local — all three have a free tier.");
        } else if (ok.length === 0) {
            console.log("[medosha-ai] No image provider passed validation. Image generation will report which key to fix.");
        }
    }).catch((error)=>{
        // Startup validation failing is not a reason for the server not to run.
        console.error("[medosha-ai] provider validation failed:", error);
    });
}
}),
];

//# sourceMappingURL=supabase_migrations_src_instrumentation_ts_0l-o9sk._.js.map