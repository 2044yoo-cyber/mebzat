(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(["chunks/supabase_migrations_0hk-n3m._.js",
"[project]/supabase/migrations/src/instrumentation.ts [instrumentation-edge] (ecmascript)", ((__turbopack_context__) => {
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
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
    const validateAll = undefined;
    const IMAGE_PROVIDERS = undefined;
    const isUsable = undefined, PROVIDER_STATUS = undefined;
}
}),
"[project]/supabase/migrations/node_modules/next/dist/esm/build/templates/edge-wrapper.js { MODULE => \"[project]/supabase/migrations/src/instrumentation.ts [instrumentation-edge] (ecmascript)\" } [instrumentation-edge] (ecmascript)", ((__turbopack_context__, module, exports) => {

// The wrapped module could be an async module, we handle that with the proxy
// here. The comma expression makes sure we don't call the function with the
// module as the "this" arg.
// Turn exports into functions that are also a thenable. This way you can await the whole object
// or  exports (e.g. for Components) or call them directly as though they are async functions
// (e.g. edge functions/middleware, this is what the Edge Runtime does).
// Catch promise to prevent UnhandledPromiseRejectionWarning, this will be propagated through
// the awaited export(s) anyway.
self._ENTRIES ||= {};
const modProm = Promise.resolve().then(()=>__turbopack_context__.i("[project]/supabase/migrations/src/instrumentation.ts [instrumentation-edge] (ecmascript)"));
modProm.catch(()=>{});
self._ENTRIES["middleware_instrumentation"] = new Proxy(modProm, {
    get (innerModProm, name) {
        if (name === 'then') {
            return (res, rej)=>innerModProm.then(res, rej);
        }
        let result = (...args)=>innerModProm.then((mod)=>(0, mod[name])(...args));
        result.then = (res, rej)=>innerModProm.then((mod)=>mod[name]).then(res, rej);
        return result;
    }
});
}),
]);

//# sourceMappingURL=supabase_migrations_0hk-n3m._.js.map