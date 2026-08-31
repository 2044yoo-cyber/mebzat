module.exports = [
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/supabase/migrations/src/components/layout/theme-provider.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThemeProvider",
    ()=>ThemeProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next-themes/dist/index.mjs [app-ssr] (ecmascript)");
"use client";
;
;
function ThemeProvider({ children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ThemeProvider"], {
        ...props,
        children: children
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/layout/theme-provider.tsx",
        lineNumber: 10,
        columnNumber: 10
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cn",
    ()=>cn,
    "formatPrice",
    ()=>formatPrice,
    "formatRelativeTime",
    ()=>formatRelativeTime,
    "slugify",
    ()=>slugify
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/clsx/dist/clsx.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/tailwind-merge/dist/bundle-mjs.mjs [app-ssr] (ecmascript)");
;
;
function cn(...inputs) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$tailwind$2d$merge$2f$dist$2f$bundle$2d$mjs$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["twMerge"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$clsx$2f$dist$2f$clsx$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clsx"])(inputs));
}
const RELATIVE_UNITS = [
    [
        "year",
        1000 * 60 * 60 * 24 * 365
    ],
    [
        "month",
        1000 * 60 * 60 * 24 * 30
    ],
    [
        "week",
        1000 * 60 * 60 * 24 * 7
    ],
    [
        "day",
        1000 * 60 * 60 * 24
    ],
    [
        "hour",
        1000 * 60 * 60
    ],
    [
        "minute",
        1000 * 60
    ]
];
const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto"
});
function formatPrice(amount, currency = "USD") {
    if (amount == null) return "Price on request";
    try {
        return new Intl.NumberFormat("en", {
            style: "currency",
            currency,
            maximumFractionDigits: amount % 1 === 0 ? 0 : 2
        }).format(amount);
    } catch  {
        // Unknown currency code — fall back to a plain number + code.
        return `${currency} ${amount.toLocaleString()}`;
    }
}
function formatRelativeTime(date) {
    const diff = new Date(date).getTime() - Date.now();
    for (const [unit, ms] of RELATIVE_UNITS){
        if (Math.abs(diff) >= ms) {
            return relativeTimeFormatter.format(Math.round(diff / ms), unit);
        }
    }
    return "just now";
}
function slugify(input) {
    return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
}),
"[project]/supabase/migrations/src/components/ui/avatar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Avatar",
    ()=>Avatar,
    "AvatarBadge",
    ()=>AvatarBadge,
    "AvatarFallback",
    ()=>AvatarFallback,
    "AvatarGroup",
    ()=>AvatarGroup,
    "AvatarGroupCount",
    ()=>AvatarGroupCount,
    "AvatarImage",
    ()=>AvatarImage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$avatar$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/@base-ui/react/avatar/index.parts.mjs [app-ssr] (ecmascript) <export * as Avatar>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
function Avatar({ className, size = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$avatar$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Root, {
        "data-slot": "avatar",
        "data-size": size,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 16,
        columnNumber: 5
    }, this);
}
function AvatarImage({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$avatar$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Image, {
        "data-slot": "avatar-image",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("aspect-square size-full rounded-full object-cover", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 30,
        columnNumber: 5
    }, this);
}
function AvatarFallback({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$avatar$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Avatar$3e$__["Avatar"].Fallback, {
        "data-slot": "avatar-fallback",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
function AvatarBadge({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-slot": "avatar-badge",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none", "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden", "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2", "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 59,
        columnNumber: 5
    }, this);
}
function AvatarGroup({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "avatar-group",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 75,
        columnNumber: 5
    }, this);
}
function AvatarGroupCount({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "avatar-group-count",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/avatar.tsx",
        lineNumber: 91,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/supabase/migrations/src/components/home/home-panel-client.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HomePanelClient",
    ()=>HomePanelClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-ssr] (ecmascript) <export default as ArrowRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeCheck$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/badge-check.mjs [app-ssr] (ecmascript) <export default as BadgeCheck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building-2.mjs [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gavel$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Gavel$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/gavel.mjs [app-ssr] (ecmascript) <export default as Gavel>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hard-hat.mjs [app-ssr] (ecmascript) <export default as HardHat>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/map-pin.mjs [app-ssr] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/package.mjs [app-ssr] (ecmascript) <export default as Package>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/star.mjs [app-ssr] (ecmascript) <export default as Star>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/store.mjs [app-ssr] (ecmascript) <export default as Store>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/trending-up.mjs [app-ssr] (ecmascript) <export default as TrendingUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/truck.mjs [app-ssr] (ecmascript) <export default as Truck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/users.mjs [app-ssr] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/avatar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
const TABS = [
    {
        id: "market",
        label: "Market",
        emoji: "📈"
    },
    {
        id: "build",
        label: "Build",
        emoji: "🏗"
    },
    {
        id: "people",
        label: "People",
        emoji: "👥"
    }
];
function HomePanelClient({ data, children }) {
    const [tab, setTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("market");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                role: "tablist",
                "aria-label": "Panel sections",
                className: "sticky top-0 z-10 -mx-1 flex gap-1 bg-background/90 px-1 pb-2 backdrop-blur",
                children: TABS.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        role: "tab",
                        "aria-selected": tab === entry.id,
                        onClick: ()=>setTab(entry.id),
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors", tab === entry.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                "aria-hidden": true,
                                children: entry.emoji
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 141,
                                columnNumber: 13
                            }, this),
                            entry.label
                        ]
                    }, entry.id, true, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 128,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this),
            tab === "market" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Prices, {
                        rows: data.prices
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 149,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Products, {
                        items: data.products
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 150,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Equipment, {
                        items: data.equipment
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 151,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true),
            tab === "build" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Projects, {
                        items: data.projects
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 157,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Companies, {
                        items: data.companies
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 158,
                        columnNumber: 11
                    }, this),
                    children
                ]
            }, void 0, true),
            tab === "people" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Professionals, {
                items: data.professionals
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 163,
                columnNumber: 28
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 118,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
// The shape every section shares — the Invest widget's shape
// ---------------------------------------------------------------------------
function Panel({ title, icon: Icon, blurb, stats, meter, children, href, cta, ctaIcon: CtaIcon }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "flex items-center gap-1.5 text-sm font-medium",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                        className: "size-4 text-brand"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 196,
                        columnNumber: 9
                    }, this),
                    title
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 195,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-muted-foreground",
                children: blurb
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 200,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "rounded-2xl border p-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dl", {
                        className: "grid grid-cols-2 gap-3",
                        children: stats.map((stat)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Stat, {
                                ...stat
                            }, stat.label, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 205,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 203,
                        columnNumber: 9
                    }, this),
                    meter && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-3 space-y-1.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-baseline justify-between text-xs",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-muted-foreground",
                                        children: meter.label
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 212,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-semibold text-brand tabular-nums",
                                        children: meter.note ?? `${Math.round(meter.pct)}%`
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 213,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 211,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                role: "progressbar",
                                "aria-valuenow": Math.round(meter.pct),
                                "aria-valuemin": 0,
                                "aria-valuemax": 100,
                                "aria-label": meter.label,
                                className: "h-1.5 w-full overflow-hidden rounded-full bg-muted",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "h-full rounded-full bg-brand transition-[width] duration-500",
                                    style: {
                                        width: `${Math.min(100, Math.max(0, meter.pct))}%`
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                    lineNumber: 225,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 217,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 210,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 202,
                columnNumber: 7
            }, this),
            children,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                href: href,
                className: "flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(CtaIcon, {
                        className: "size-3.5"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 240,
                        columnNumber: 9
                    }, this),
                    cta,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__["ArrowRight"], {
                        className: "size-3.5"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 242,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 236,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 194,
        columnNumber: 5
    }, this);
}
function Stat({ label, value, icon }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                className: "flex items-center gap-1 text-xs text-muted-foreground",
                children: [
                    icon,
                    label
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 259,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                className: "text-lg leading-tight font-semibold tabular-nums",
                children: value
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 263,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 258,
        columnNumber: 5
    }, this);
}
/**
 * One row: a bordered card with a headline, a sub-line, a figure and a bar.
 *
 * The same card the Invest widget uses for a project, because the reason it
 * reads well there is that the bar gives you the comparison before you have
 * read a word.
 */ function MeterRow({ href, title, subtitle, figure, figureTone = "brand", pct, thumb }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            href: href,
            className: "block rounded-xl border p-2.5 transition-colors hover:border-brand",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "flex min-w-0 items-center gap-1.5",
                    children: [
                        thumb,
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "min-w-0 truncate text-sm font-medium",
                            children: title
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 305,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 303,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-baseline justify-between gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "min-w-0 flex-1 truncate text-xs text-muted-foreground",
                            children: subtitle
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 309,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("shrink-0 text-xs font-semibold tabular-nums", figureTone === "good" && "text-emerald-600 dark:text-emerald-400", figureTone === "warn" && "text-amber-600 dark:text-amber-400", figureTone === "brand" && "text-brand", figureTone === "plain" && "text-foreground"),
                            children: figure
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 312,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 308,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("h-full rounded-full transition-[width] duration-500", figureTone === "good" ? "bg-emerald-500" : figureTone === "warn" ? "bg-amber-500" : "bg-brand"),
                        style: {
                            width: `${Math.min(100, Math.max(3, pct))}%`
                        }
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 326,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 325,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 296,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 295,
        columnNumber: 5
    }, this);
}
/** A 20px square thumbnail, inline with a row's title. */ function Thumb({ src, icon: Icon }) {
    if (!src) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            className: "flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                className: "size-3"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                lineNumber: 348,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 347,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "relative size-5 shrink-0 overflow-hidden rounded bg-muted",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            src: src,
            alt: "",
            fill: true,
            sizes: "20px",
            className: "object-cover"
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 354,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 353,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------
function Prices({ rows }) {
    if (rows.length === 0) return null;
    const verified = rows.filter((row)=>row.verified).length;
    const bids = rows.reduce((total, row)=>total + row.bidCount, 0);
    const cities = new Set(rows.map((row)=>row.city).filter(Boolean)).size;
    const busiest = rows.reduce((top, row)=>Math.max(top, row.bidCount), 0);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Material prices",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"],
        blurb: "What materials are going for, and what buyers are bidding",
        stats: [
            {
                label: "Listings",
                value: String(rows.length)
            },
            {
                label: "Open bids",
                value: String(bids),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gavel$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Gavel$3e$__["Gavel"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 378,
                    columnNumber: 58
                }, this)
            },
            {
                label: "Verified",
                value: String(verified),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeCheck$3e$__["BadgeCheck"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 382,
                    columnNumber: 17
                }, this)
            },
            {
                label: "Cities",
                value: String(cities),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 384,
                    columnNumber: 57
                }, this)
            }
        ],
        meter: {
            label: "Verified suppliers",
            pct: verified / rows.length * 100,
            note: `${verified} of ${rows.length}`
        },
        href: "/price-exchange?sector=material",
        cta: "Open Price Exchange",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: rows.slice(0, 3).map((row)=>{
                // The best bid against the asking price. Above zero means buyers
                // are bidding over the ask, which is the interesting case.
                const spread = row.highestBid != null && row.price > 0 ? (row.highestBid - row.price) / row.price * 100 : null;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MeterRow, {
                    href: `/price-exchange/${row.id}`,
                    title: row.item,
                    subtitle: `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(row.price, row.currency)} per ${row.unit}` + (row.bidCount > 0 ? ` · ${row.bidCount === 1 ? "1 bid" : `${row.bidCount} bids`}` : ""),
                    figure: spread != null ? `${spread >= 0 ? "+" : ""}${spread.toFixed(1)}%` : row.bidCount > 0 ? "Bidding" : "No bids",
                    figureTone: spread == null ? "plain" : spread >= 0 ? "good" : "warn",
                    // One meaning for every bar in this section: how much bidding
                    // interest this listing has, against the busiest one on screen.
                    // Mixing that with a price spread on the same bar made three
                    // full bars that all meant something different.
                    pct: busiest === 0 ? 0 : row.bidCount / busiest * 100
                }, row.id, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 405,
                    columnNumber: 13
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 395,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 372,
        columnNumber: 5
    }, this);
}
function Products({ items }) {
    if (items.length === 0) return null;
    const priced = items.filter((item)=>item.price != null);
    const dearest = priced.reduce((top, item)=>Math.max(top, item.price), 0);
    const cheapest = priced.reduce((low, item)=>Math.min(low, item.price), Number.POSITIVE_INFINITY);
    const currency = items[0]?.currency ?? "ETB";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Marketplace",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"],
        blurb: "What is selling on Medosha right now",
        stats: [
            {
                label: "Products",
                value: String(items.length)
            },
            {
                label: "With photos",
                value: String(items.filter((i)=>i.imageUrl).length)
            },
            {
                label: "From",
                value: priced.length > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(cheapest, currency) : "—"
            },
            {
                label: "Up to",
                value: priced.length > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(dearest, currency) : "—"
            }
        ],
        href: "/marketplace",
        cta: "Browse the marketplace",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: items.slice(0, 3).map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MeterRow, {
                    href: `/marketplace/${item.id}`,
                    title: item.title,
                    subtitle: [
                        item.brand,
                        item.unit ? `per ${item.unit}` : null
                    ].filter(Boolean).join(" · ") || "In the marketplace",
                    figure: item.price == null ? "—" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(item.price, item.currency),
                    figureTone: "plain",
                    // Where this sits against the dearest thing on the list.
                    pct: item.price == null || dearest === 0 ? 0 : item.price / dearest * 100,
                    thumb: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Thumb, {
                        src: item.imageUrl,
                        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"]
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 492,
                        columnNumber: 20
                    }, this)
                }, item.id, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 475,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 473,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 453,
        columnNumber: 5
    }, this);
}
function Equipment({ items }) {
    if (items.length === 0) return null;
    const rates = items.map((item)=>item.dailyRate).filter((rate)=>rate != null);
    const dearest = rates.reduce((top, rate)=>Math.max(top, rate), 0);
    const cities = new Set(items.map((item)=>item.city).filter(Boolean)).size;
    const currency = items[0]?.currency ?? "ETB";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Equipment for hire",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
        blurb: "Plant and machinery available this week",
        stats: [
            {
                label: "Machines",
                value: String(items.length)
            },
            {
                label: "Cities",
                value: String(cities),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 517,
                    columnNumber: 57
                }, this)
            },
            {
                label: "From",
                value: rates.length > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(Math.min(...rates), currency) : "—"
            },
            {
                label: "Per day up to",
                value: rates.length > 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(dearest, currency) : "—"
            }
        ],
        href: "/equipment",
        cta: "All equipment",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: items.slice(0, 3).map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MeterRow, {
                    href: `/equipment/${item.id}`,
                    title: item.title,
                    subtitle: item.city ?? "Location on request",
                    figure: item.dailyRate == null ? "—" : `${(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(item.dailyRate, item.currency)}/day`,
                    figureTone: "plain",
                    pct: item.dailyRate == null || dearest === 0 ? 0 : item.dailyRate / dearest * 100,
                    thumb: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Thumb, {
                        src: item.imageUrl,
                        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"]
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 552,
                        columnNumber: 20
                    }, this)
                }, item.id, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 536,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 534,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 511,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function Projects({ items }) {
    if (items.length === 0) return null;
    const cities = new Set(items.map((item)=>item.city).filter(Boolean)).size;
    const types = new Set(items.map((item)=>item.buildingType).filter(Boolean)).size;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Recent projects",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
        blurb: "Work being built and finished across the country",
        stats: [
            {
                label: "Published",
                value: String(items.length)
            },
            {
                label: "Cities",
                value: String(cities),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 579,
                    columnNumber: 57
                }, this)
            },
            {
                label: "Building types",
                value: String(types)
            },
            {
                label: "With photos",
                value: String(items.filter((i)=>i.coverUrl).length)
            }
        ],
        href: "/projects",
        cta: "All projects",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            children: items.map((project)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: `/projects/${project.id}`,
                    className: "group w-28 shrink-0",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "relative block aspect-4/3 w-full overflow-hidden rounded-xl border bg-muted transition-colors group-hover:border-brand",
                            children: project.coverUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                src: project.coverUrl,
                                alt: "",
                                fill: true,
                                sizes: "112px",
                                className: "object-cover transition-transform duration-300 group-hover:scale-105"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 599,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 597,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "mt-1 block truncate text-xs font-medium",
                            children: project.title
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 608,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "block truncate text-[11px] text-muted-foreground",
                            children: project.city ?? project.buildingType ?? ""
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                            lineNumber: 611,
                            columnNumber: 13
                        }, this)
                    ]
                }, project.id, true, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 592,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 590,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 573,
        columnNumber: 5
    }, this);
}
function Companies({ items }) {
    if (items.length === 0) return null;
    const verified = items.filter((item)=>item.verified).length;
    const rated = items.filter((item)=>item.rating > 0);
    const average = rated.length > 0 ? rated.reduce((total, item)=>total + item.rating, 0) / rated.length : 0;
    const cities = new Set(items.map((item)=>item.city).filter(Boolean)).size;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Companies",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
        blurb: "Suppliers, contractors and consultancies on Medosha",
        stats: [
            {
                label: "Companies",
                value: String(items.length)
            },
            {
                label: "Verified",
                value: String(verified),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeCheck$3e$__["BadgeCheck"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 642,
                    columnNumber: 17
                }, this)
            },
            {
                label: "Average rating",
                value: average > 0 ? average.toFixed(1) : "—",
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__["Star"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 647,
                    columnNumber: 17
                }, this)
            },
            {
                label: "Cities",
                value: String(cities),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 649,
                    columnNumber: 57
                }, this)
            }
        ],
        meter: {
            label: "Verified companies",
            pct: verified / items.length * 100,
            note: `${verified} of ${items.length}`
        },
        href: "/companies",
        cta: "All companies",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: items.slice(0, 3).map((company)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MeterRow, {
                    href: `/companies/${company.slug}`,
                    title: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "flex items-center gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate",
                                children: company.name
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 667,
                                columnNumber: 17
                            }, this),
                            company.verified && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeCheck$3e$__["BadgeCheck"], {
                                className: "size-3 shrink-0 text-brand"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 669,
                                columnNumber: 19
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 666,
                        columnNumber: 15
                    }, this),
                    subtitle: `${company.category ?? "Company"}${company.city ? ` · ${company.city}` : ""}`,
                    figure: company.rating > 0 ? `★ ${company.rating.toFixed(1)}` : "New",
                    figureTone: company.rating >= 4.5 ? "good" : "brand",
                    // Rating out of five.
                    pct: company.rating / 5 * 100,
                    thumb: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Thumb, {
                        src: company.logoUrl,
                        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"]
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 680,
                        columnNumber: 20
                    }, this)
                }, company.id, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 662,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 660,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 633,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function Professionals({ items }) {
    if (items.length === 0) return null;
    const cities = new Set(items.map((item)=>item.city).filter(Boolean)).size;
    const roles = new Set(items.map((item)=>item.accountType).filter(Boolean)).size;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
        title: "Professionals",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"],
        blurb: "Architects, engineers, designers and trades",
        stats: [
            {
                label: "Professionals",
                value: String(items.length)
            },
            {
                label: "Cities",
                value: String(cities),
                icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 707,
                    columnNumber: 57
                }, this)
            },
            {
                label: "Disciplines",
                value: String(roles)
            },
            {
                label: "With photos",
                value: String(items.filter((i)=>i.avatarUrl).length)
            }
        ],
        href: "/directory/individual",
        cta: "Browse professionals",
        ctaIcon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"],
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
            className: "space-y-2",
            children: items.slice(0, 4).map((person)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: `/u/${person.username}`,
                        className: "flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors hover:border-brand",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Avatar"], {
                                className: "shrink-0",
                                children: [
                                    person.avatarUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AvatarImage"], {
                                        src: person.avatarUrl,
                                        alt: ""
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 724,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AvatarFallback"], {
                                        children: initials(person.name)
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 726,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 722,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "min-w-0 flex-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "block truncate text-sm font-medium",
                                        children: person.name
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 729,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "block truncate text-xs text-muted-foreground",
                                        children: [
                                            label(person.accountType),
                                            person.city && ` · ${person.city}`
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                        lineNumber: 732,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 728,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__["ArrowRight"], {
                                className: "size-3.5 shrink-0 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                                lineNumber: 737,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                        lineNumber: 718,
                        columnNumber: 13
                    }, this)
                }, person.username, false, {
                    fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
                    lineNumber: 717,
                    columnNumber: 11
                }, this))
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
            lineNumber: 715,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/home/home-panel-client.tsx",
        lineNumber: 701,
        columnNumber: 5
    }, this);
}
/** account_type is stored snake_case; nobody wants to read "mixed_use". */ function label(accountType) {
    if (!accountType) return "Member";
    return accountType.split("_").map((part)=>part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function initials(name) {
    return name.split(/\s+/).slice(0, 2).map((part)=>part.charAt(0).toUpperCase()).join("");
}
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Workspace state that outlives navigation.
 *
 * Deliberately an external store rather than React state. The shell reads it
 * through `useSyncExternalStore`, which lets the server render the defaults
 * and the client swap in what was saved without ever calling setState from an
 * effect — the pattern the React Compiler lint rules exist to prevent.
 *
 * Everything here is layout preference. Nothing here is data, so a corrupt or
 * missing entry costs the user a default width, never a failed render.
 */ __turbopack_context__.s([
    "NAV_WIDTH",
    ()=>NAV_WIDTH,
    "PANEL_WIDTH",
    ()=>PANEL_WIDTH,
    "SPLIT_RATIO",
    ()=>SPLIT_RATIO,
    "clamp",
    ()=>clamp,
    "closePanel",
    ()=>closePanel,
    "closeTab",
    ()=>closeTab,
    "getServerSnapshot",
    ()=>getServerSnapshot,
    "getSnapshot",
    ()=>getSnapshot,
    "hydrate",
    ()=>hydrate,
    "mutate",
    ()=>mutate,
    "openPanel",
    ()=>openPanel,
    "openTab",
    ()=>openTab,
    "subscribe",
    ()=>subscribe,
    "togglePin",
    ()=>togglePin,
    "toggleSection",
    ()=>toggleSection,
    "update",
    ()=>update
]);
const NAV_WIDTH = {
    min: 260,
    max: 300,
    default: 276
};
const PANEL_WIDTH = {
    min: 340,
    max: 420,
    default: 372
};
const SPLIT_RATIO = {
    min: 0.3,
    max: 0.7,
    default: 0.5
};
const DEFAULTS = {
    navCollapsed: false,
    navWidth: NAV_WIDTH.default,
    panelCollapsed: false,
    panelMobile: false,
    panelWidth: PANEL_WIDTH.default,
    collapsedSections: [],
    pins: [
        "ai-home",
        "price-exchange",
        "projects",
        "messages",
        "companies"
    ],
    tabs: [],
    splitHref: null,
    splitRatio: SPLIT_RATIO.default,
    aiOpen: false
};
const KEY = "medosha:workspace:v1";
const MAX_TABS = 8;
let state = DEFAULTS;
let hydrated = false;
const listeners = new Set();
function emit() {
    for (const listener of listeners)listener();
}
function subscribe(listener) {
    listeners.add(listener);
    return ()=>{
        listeners.delete(listener);
    };
}
function getSnapshot() {
    return state;
}
function getServerSnapshot() {
    return DEFAULTS;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** Trust nothing from storage: a hand-edited entry must not break the shell. */ function sanitize(raw) {
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const input = raw;
    const tabs = Array.isArray(input.tabs) ? input.tabs.filter((tab)=>Boolean(tab) && typeof tab.href === "string" && tab.href.startsWith("/") && typeof tab.label === "string").slice(0, MAX_TABS) : DEFAULTS.tabs;
    return {
        navCollapsed: input.navCollapsed === true,
        navWidth: Number.isFinite(input.navWidth) ? clamp(input.navWidth, NAV_WIDTH.min, NAV_WIDTH.max) : NAV_WIDTH.default,
        panelCollapsed: input.panelCollapsed === true,
        // Always starts shut on a small screen, for the same reason as the dock.
        panelMobile: false,
        panelWidth: Number.isFinite(input.panelWidth) ? clamp(input.panelWidth, PANEL_WIDTH.min, PANEL_WIDTH.max) : PANEL_WIDTH.default,
        collapsedSections: Array.isArray(input.collapsedSections) ? input.collapsedSections.filter((id)=>typeof id === "string") : [],
        pins: Array.isArray(input.pins) ? input.pins.filter((id)=>typeof id === "string").slice(0, 12) : DEFAULTS.pins,
        tabs,
        splitHref: typeof input.splitHref === "string" && input.splitHref.startsWith("/") ? input.splitHref : null,
        splitRatio: Number.isFinite(input.splitRatio) ? clamp(input.splitRatio, SPLIT_RATIO.min, SPLIT_RATIO.max) : SPLIT_RATIO.default,
        // The AI dock always starts shut. Reopening it on every page load would
        // steal a third of the screen from someone who opened it once, days ago.
        aiOpen: false
    };
}
function hydrate() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
let writeTimer = null;
function persist() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function update(patch) {
    state = {
        ...state,
        ...patch
    };
    persist();
    emit();
}
function mutate(fn) {
    update(fn(state));
}
function openTab(tab) {
    mutate((previous)=>{
        const existing = previous.tabs.findIndex((open)=>open.href === tab.href);
        if (existing !== -1) {
            // Already open: refresh the label (a detail page learns its title after
            // the tab was created) but keep the position, so tabs do not shuffle.
            const tabs = [
                ...previous.tabs
            ];
            tabs[existing] = tab;
            return {
                tabs
            };
        }
        const tabs = [
            ...previous.tabs,
            tab
        ];
        // Oldest out first, which is also the least recently opened.
        return {
            tabs: tabs.slice(-MAX_TABS)
        };
    });
}
function closeTab(href) {
    mutate((previous)=>({
            tabs: previous.tabs.filter((tab)=>tab.href !== href)
        }));
}
function openPanel() {
    update({
        panelCollapsed: false,
        panelMobile: true
    });
}
function closePanel() {
    update({
        panelCollapsed: true,
        panelMobile: false,
        aiOpen: false
    });
}
function togglePin(id) {
    mutate((previous)=>({
            pins: previous.pins.includes(id) ? previous.pins.filter((pin)=>pin !== id) : [
                ...previous.pins,
                id
            ].slice(0, 12)
        }));
}
function toggleSection(id) {
    mutate((previous)=>({
            collapsedSections: previous.collapsedSections.includes(id) ? previous.collapsedSections.filter((section)=>section !== id) : [
                ...previous.collapsedSections,
                id
            ]
        }));
}
;
}),
"[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseHotkey",
    ()=>parseHotkey,
    "useHotkey",
    ()=>useHotkey,
    "useShell",
    ()=>useShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
"use client";
;
;
function useShell() {
    const state = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["subscribe"], __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getSnapshot"], __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getServerSnapshot"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["hydrate"])();
    }, []);
    return state;
}
function parseHotkey(combo) {
    if (typeof combo !== "string") return null;
    const parts = combo.toLowerCase().split("+").map((part)=>part.trim()).filter(Boolean);
    // "mod+" and "" both land here. Binding either would mean a listener that
    // can never match, or worse — one that matches every key.
    const key = parts.at(-1);
    if (!key || key === "mod" || key === "shift" || key === "alt") return null;
    return {
        key,
        mod: parts.includes("mod"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt")
    };
}
/**
 * The key of an event, if it has one.
 *
 * `KeyboardEvent.key` is typed as a plain string, which is a lie in three
 * situations this application actually meets. A synthetic `new Event("keydown")`
 * — dispatched by password managers, autofill and some test helpers — arrives
 * at a keydown listener with no `key` at all. An Android soft keyboard sends
 * `"Unidentified"` mid-composition. And a browser extension can dispatch a
 * partially-built event object that satisfies nothing.
 *
 * So the value is checked rather than trusted, and anything that is not a
 * usable key is treated as "not my shortcut" — which is the correct outcome
 * for an event that says nothing about which key was pressed.
 */ function keyOf(event) {
    const key = event.key;
    if (typeof key !== "string") return null;
    const lowered = key.toLowerCase();
    if (!lowered || lowered === "unidentified" || lowered === "dead") return null;
    return lowered;
}
/** Whether the event happened while the user was typing into something. */ function isTypingTarget(target) {
    // `instanceof HTMLElement` rather than a cast: the target of an event can be
    // a Document, a Window or an element in another realm, and a cast would
    // happily read `.tagName` off any of them.
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
function useHotkey(combo, handler, enabled = true) {
    // A ref rather than a dependency, so an inline handler does not tear down
    // and rebind the document listener on every render of the component that
    // owns it. Written in an effect, because a ref must not be touched mid-render.
    const latest = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(handler);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        latest.current = handler;
    }, [
        handler
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!enabled) return;
        if (typeof document === "undefined") return;
        const shortcut = parseHotkey(combo);
        if (!shortcut) {
            // Loud in development, silent in production: a typo in a combo should be
            // findable, but must not be a console full of noise for a user.
            if ("TURBOPACK compile-time truthy", 1) {
                console.warn(`[medosha:hotkey] "${combo}" is not a usable shortcut.`);
            }
            return;
        }
        function onKeyDown(event) {
            // An IME is mid-composition. Every keystroke in Amharic passes through
            // here, and none of them are shortcuts.
            if (event.isComposing) return;
            const pressed = keyOf(event);
            if (!pressed || !shortcut || pressed !== shortcut.key) return;
            const keyboard = event;
            const mod = Boolean(keyboard.metaKey || keyboard.ctrlKey);
            if (shortcut.mod !== mod) return;
            if (shortcut.shift !== Boolean(keyboard.shiftKey)) return;
            if (shortcut.alt !== Boolean(keyboard.altKey)) return;
            // A bare key must not fire while the user is typing.
            if (!shortcut.mod && !shortcut.alt && isTypingTarget(event.target)) {
                return;
            }
            // The handler belongs to a component and can throw for reasons that have
            // nothing to do with the keystroke. Letting that escape puts the error
            // inside a DOM event listener, where React's boundaries cannot catch it —
            // which is how one bad shortcut takes down the whole workspace.
            try {
                latest.current(event);
            } catch (error) {
                console.error(`[medosha:hotkey] "${combo}" handler failed:`, error);
            }
        }
        document.addEventListener("keydown", onKeyDown);
        return ()=>document.removeEventListener("keydown", onKeyDown);
    }, [
        combo,
        enabled
    ]);
}
}),
"[project]/supabase/migrations/src/components/ai/ai-launcher.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AiLauncher",
    ()=>AiLauncher
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
function AiLauncher() {
    const { aiOpen, panelCollapsed } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    if (aiOpen && !panelCollapsed) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: ()=>{
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"])();
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                aiOpen: true
            });
        },
        "aria-label": "Ask Medosha AI",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group pointer-events-auto flex items-center gap-2 rounded-full", "border border-brand/30 bg-background/90 py-2.5 pr-4 pl-2.5 shadow-lg backdrop-blur-xl", "transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-xl", "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                    className: "size-4"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/ai-launcher.tsx",
                    lineNumber: 40,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ai/ai-launcher.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "hidden text-sm font-medium sm:inline",
                children: "Ask Medosha AI"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ai/ai-launcher.tsx",
                lineNumber: 43,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/ai/ai-launcher.tsx",
        lineNumber: 25,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LINKED_NAV_ITEMS",
    ()=>LINKED_NAV_ITEMS,
    "NAV_ITEMS",
    ()=>NAV_ITEMS,
    "NAV_ROOTS",
    ()=>NAV_ROOTS,
    "NAV_SECTIONS",
    ()=>NAV_SECTIONS,
    "breadcrumbsFor",
    ()=>breadcrumbsFor,
    "findItem",
    ()=>findItem,
    "findSection",
    ()=>findSection,
    "matchNavItem",
    ()=>matchNavItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/armchair.mjs [app-ssr] (ecmascript) <export default as Armchair>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$percent$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgePercent$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/badge-percent.mjs [app-ssr] (ecmascript) <export default as BadgePercent>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$banknote$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Banknote$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/banknote.mjs [app-ssr] (ecmascript) <export default as Banknote>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chart-column.mjs [app-ssr] (ecmascript) <export default as BarChart3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bell$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bell$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bell.mjs [app-ssr] (ecmascript) <export default as Bell>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bot.mjs [app-ssr] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/boxes.mjs [app-ssr] (ecmascript) <export default as Boxes>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/briefcase.mjs [app-ssr] (ecmascript) <export default as Briefcase>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building.mjs [app-ssr] (ecmascript) <export default as Building>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building-2.mjs [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/calendar-days.mjs [app-ssr] (ecmascript) <export default as CalendarDays>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calculator$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Calculator$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/calculator.mjs [app-ssr] (ecmascript) <export default as Calculator>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/clipboard-list.mjs [app-ssr] (ecmascript) <export default as ClipboardList>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/compass.mjs [app-ssr] (ecmascript) <export default as Compass>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$contact$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Contact$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/contact.mjs [app-ssr] (ecmascript) <export default as Contact>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$credit$2d$card$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CreditCard$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/credit-card.mjs [app-ssr] (ecmascript) <export default as CreditCard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/file-spreadsheet.mjs [app-ssr] (ecmascript) <export default as FileSpreadsheet>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$text$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileText$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/file-text.mjs [app-ssr] (ecmascript) <export default as FileText>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gavel$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Gavel$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/gavel.mjs [app-ssr] (ecmascript) <export default as Gavel>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hard-hat.mjs [app-ssr] (ecmascript) <export default as HardHat>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hammer$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hammer$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hammer.mjs [app-ssr] (ecmascript) <export default as Hammer>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/house.mjs [app-ssr] (ecmascript) <export default as Home>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/landmark.mjs [app-ssr] (ecmascript) <export default as Landmark>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$line$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LineChart$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chart-line.mjs [app-ssr] (ecmascript) <export default as LineChart>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/layers.mjs [app-ssr] (ecmascript) <export default as Layers>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/layout-dashboard.mjs [app-ssr] (ecmascript) <export default as LayoutDashboard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$life$2d$buoy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LifeBuoy$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/life-buoy.mjs [app-ssr] (ecmascript) <export default as LifeBuoy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pinned$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPinned$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/map-pinned.mjs [app-ssr] (ecmascript) <export default as MapPinned>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/message-square.mjs [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$messages$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessagesSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/messages-square.mjs [app-ssr] (ecmascript) <export default as MessagesSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/package.mjs [app-ssr] (ecmascript) <export default as Package>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$play$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PlayCircle$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/circle-play.mjs [app-ssr] (ecmascript) <export default as PlayCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$receipt$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Receipt$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/receipt.mjs [app-ssr] (ecmascript) <export default as Receipt>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$repeat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Repeat$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/repeat.mjs [app-ssr] (ecmascript) <export default as Repeat>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ruler$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ruler$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/ruler.mjs [app-ssr] (ecmascript) <export default as Ruler>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scroll$2d$text$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ScrollText$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/scroll-text.mjs [app-ssr] (ecmascript) <export default as ScrollText>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/store.mjs [app-ssr] (ecmascript) <export default as Store>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/trending-up.mjs [app-ssr] (ecmascript) <export default as TrendingUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trees$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trees$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/trees.mjs [app-ssr] (ecmascript) <export default as Trees>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/truck.mjs [app-ssr] (ecmascript) <export default as Truck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/users.mjs [app-ssr] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$warehouse$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Warehouse$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/warehouse.mjs [app-ssr] (ecmascript) <export default as Warehouse>");
;
const NAV_SECTIONS = [
    {
        id: "home",
        label: "Home",
        emoji: "🏠",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"],
        href: "/",
        items: []
    },
    // Medosha AI first, and now as one row rather than thirteen.
    //
    // This section used to list every design capability separately — Facade
    // Designer, Interior Designer, Material Replacer, Background Remover, and ten
    // more. Each was a real workspace and each still works; what they were not is
    // a decision anybody should have to make before typing. Somebody with a photo
    // of their building does not know whether they want "Redesign My Space" or
    // "AI Image Editor" or "Material Replacer", and being asked is the point at
    // which they close the tab.
    //
    // The capabilities moved inside Medosha AI, which reads the request and picks
    // one. Nothing was deleted: /ai?tool=facade and every other tool link still
    // opens the workspace it always did, and the command palette still finds them
    // through the keywords below.
    {
        id: "ai",
        label: "AI",
        emoji: "🤖",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"],
        items: [
            {
                id: "ai-home",
                label: "Medosha AI",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"],
                href: "/ai",
                private: true,
                hint: "One AI for construction, property and design",
                keywords: [
                    // Everything the removed rows used to be findable by. The palette is
                    // how somebody who learned the old names gets to the new place.
                    "chat",
                    "ask",
                    "assistant",
                    "studio",
                    "redesign",
                    "interior",
                    "facade",
                    "elevation",
                    "furniture",
                    "material",
                    "replace",
                    "sketch",
                    "render",
                    "floor plan",
                    "landscape",
                    "lighting",
                    "product",
                    "background",
                    "upscale",
                    "image",
                    "generate",
                    "edit photo",
                    "cost",
                    "estimate",
                    "boq",
                    "supplier",
                    "document"
                ]
            }
        ]
    },
    // Berchuma Studio is its own section rather than a row under AI. It is a
    // different kind of thing from a conversation — a parametric editor with
    // saved projects and a gallery — and burying it in a list of AI tools
    // undersold it.
    {
        id: "berchuma",
        label: "Berchuma Studio",
        emoji: "🪑",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__["Armchair"],
        items: [
            {
                id: "berchuma-studio",
                label: "Design Studio",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__["Armchair"],
                href: "/studio",
                private: true,
                hint: "Design fitted furniture and get a price",
                keywords: [
                    "furniture",
                    "wardrobe",
                    "kitchen",
                    "joinery",
                    "cabinet",
                    "berchuma",
                    "cut list"
                ]
            },
            {
                id: "berchuma-projects",
                label: "My Projects",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
                // Not /projects — that is the construction portfolio module and is
                // already a row under Marketplace. Two rows pointing at one route is a
                // duplicate navigation item, and the one that would have been wrong is
                // this one: a Berchuma project is a design, not a build.
                href: "/designs?mine=1",
                private: true,
                hint: "Everything you have designed",
                keywords: [
                    "my designs",
                    "saved",
                    "drafts"
                ]
            },
            {
                id: "berchuma-gallery",
                label: "Gallery",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__["Boxes"],
                href: "/designs",
                hint: "Published designs you can remix",
                keywords: [
                    "designs",
                    "gallery",
                    "remix",
                    "templates"
                ]
            }
        ]
    },
    // Property second: buying, selling and renting is what most visitors arrive
    // for, and it was previously five sections down.
    {
        id: "property",
        label: "Property",
        emoji: "🏡",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building$3e$__["Building"],
        items: [
            {
                id: "city",
                label: "3D City Map",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pinned$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPinned$3e$__["MapPinned"],
                href: "/city",
                hint: "Explore listings on the map",
                keywords: [
                    "map",
                    "medosha city",
                    "3d",
                    "explore"
                ]
            },
            {
                id: "buy",
                label: "Buy",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"],
                href: "/city?kind=sale",
                hint: "Properties for sale"
            },
            {
                id: "rent",
                label: "Rent",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$repeat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Repeat$3e$__["Repeat"],
                href: "/city?kind=rent",
                hint: "Properties to rent"
            },
            {
                id: "sell",
                label: "Sell Your Property",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$percent$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgePercent$3e$__["BadgePercent"],
                href: "/property/new",
                private: true,
                hint: "List it — photos first, exact pin stays private",
                keywords: [
                    "list",
                    "sell",
                    "advertise",
                    "post property"
                ]
            },
            {
                id: "land",
                label: "Land & Plots",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trees$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trees$3e$__["Trees"],
                href: "/city?type=land,farm",
                hint: "Plots and farmland"
            },
            {
                id: "commercial",
                label: "Commercial",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$warehouse$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Warehouse$3e$__["Warehouse"],
                href: "/city?type=commercial,office,shop,hotel,restaurant,mixed_use",
                hint: "Offices, shops and mixed use"
            },
            {
                id: "developers",
                label: "Developers",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
                href: "/companies?category=developer",
                hint: "Property developers"
            },
            {
                id: "agencies",
                label: "Agencies",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$contact$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Contact$3e$__["Contact"],
                href: "/companies?category=real+estate",
                hint: "Estate agencies and brokers"
            }
        ]
    },
    // Material Exchange third, promoted out of Construction. Prices are the
    // reason a lot of people open this site twice a week.
    {
        id: "material-exchange",
        label: "Material Exchange",
        emoji: "🧱",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"],
        items: [
            {
                id: "price-exchange",
                label: "Price Exchange",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"],
                href: "/price-exchange",
                hint: "Live material prices and bids",
                keywords: [
                    "prices",
                    "market",
                    "quotes",
                    "rates",
                    "exchange"
                ]
            },
            {
                id: "cost-database",
                label: "Best Rates",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__["FileSpreadsheet"],
                href: "/price-exchange?sort=lowest",
                hint: "Lowest price by material",
                keywords: [
                    "cheapest",
                    "benchmark",
                    "unit cost"
                ]
            },
            {
                id: "materials",
                label: "Buy Materials",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$boxes$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Boxes$3e$__["Boxes"],
                href: "/marketplace?category=construction-materials",
                hint: "Cement, steel, blocks, aggregates",
                keywords: [
                    "cement",
                    "rebar",
                    "hcb",
                    "sand",
                    "aggregate"
                ]
            },
            {
                id: "sell-material",
                label: "Sell Materials",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"],
                href: "/products/new",
                private: true,
                hint: "List stock for sale",
                keywords: [
                    "supply",
                    "list product",
                    "sell"
                ]
            }
        ]
    },
    {
        id: "marketplace",
        label: "Marketplace",
        emoji: "🛒",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"],
        items: [
            {
                id: "products",
                label: "Products",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"],
                href: "/marketplace",
                hint: "Every product on Medosha",
                keywords: [
                    "shop",
                    "buy",
                    "catalogue",
                    "supplies"
                ]
            },
            {
                id: "services",
                label: "Services",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hammer$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hammer$3e$__["Hammer"],
                href: "/services",
                hint: "Hire a trade or a specialist",
                keywords: [
                    "trades",
                    "contractors",
                    "hire"
                ]
            },
            {
                id: "furniture",
                label: "Furniture",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__["Armchair"],
                href: "/marketplace?category=furniture",
                hint: "Furniture category"
            },
            {
                id: "equipment",
                label: "Equipment Rental",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
                href: "/equipment",
                hint: "Plant and machinery to rent",
                keywords: [
                    "rental",
                    "hire",
                    "machinery",
                    "plant",
                    "excavator"
                ]
            },
            {
                id: "companies",
                label: "Companies",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
                href: "/companies",
                hint: "Suppliers, contractors and consultancies"
            },
            {
                id: "professionals",
                label: "Professionals",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"],
                href: "/directory/individual",
                private: true,
                hint: "Architects, engineers, designers"
            },
            {
                id: "projects",
                label: "Projects",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
                href: "/projects",
                private: true,
                hint: "Work in progress and completed builds"
            }
        ]
    },
    {
        id: "construction",
        label: "Construction",
        emoji: "🏗",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
        items: [
            // These five are Medosha AI pinned to one assistant, not five separate
            // products. Each opens the same conversation with that specialist
            // answering — and the same request typed into Medosha AI without opening
            // anything reaches the same place. The rows exist because somebody who
            // knows they want a BOQ should not have to describe their way to one.
            {
                id: "estimations",
                label: "Cost Estimator",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calculator$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Calculator$3e$__["Calculator"],
                href: "/ai?agent=cost",
                private: true,
                hint: "Budget a build with stated assumptions",
                keywords: [
                    "estimate",
                    "budget",
                    "cost"
                ]
            },
            {
                id: "takeoff",
                label: "Takeoff from a model",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ruler$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Ruler$3e$__["Ruler"],
                href: "/takeoff",
                private: true,
                hint: "Import IFC or DXF and measure it",
                keywords: [
                    "ifc",
                    "dxf",
                    "bim",
                    "import",
                    "quantities",
                    "measure",
                    "model"
                ]
            },
            {
                id: "boq",
                label: "BOQ Generator",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"],
                href: "/ai?agent=boq",
                private: true,
                hint: "Draft a bill of quantities",
                keywords: [
                    "bill of quantities",
                    "takeoff"
                ]
            },
            {
                id: "material-advisor",
                label: "Material Advisor",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__["Layers"],
                href: "/ai?agent=materials",
                private: true,
                hint: "Compare materials and specifications",
                keywords: [
                    "specification",
                    "compare",
                    "which material"
                ]
            },
            {
                id: "supplier-finder",
                label: "Supplier Finder",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"],
                href: "/ai?agent=marketplace",
                private: true,
                hint: "Find products and suppliers on Medosha",
                keywords: [
                    "who sells",
                    "stockist",
                    "vendor"
                ]
            },
            {
                id: "document-reader",
                label: "AI Document Reader",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$text$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileText$3e$__["FileText"],
                href: "/ai?agent=drawings",
                private: true,
                hint: "Drawing sets, specs and what they should contain",
                keywords: [
                    "drawings",
                    "specification",
                    "tender",
                    "contract"
                ]
            },
            {
                id: "jobs",
                label: "Jobs",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__["Briefcase"],
                href: "/jobs",
                hint: "Site and office roles",
                keywords: [
                    "vacancy",
                    "hiring",
                    "careers",
                    "work",
                    "apply"
                ]
            },
            {
                id: "post-job",
                label: "Post a Job",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
                href: "/jobs/new",
                private: true,
                hint: "Hire an engineer, a foreman, a trade",
                keywords: [
                    "hire",
                    "recruit",
                    "vacancy",
                    "advertise"
                ]
            },
            {
                id: "methods",
                label: "Construction Methods",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scroll$2d$text$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ScrollText$3e$__["ScrollText"],
                keywords: [
                    "techniques",
                    "how to build"
                ]
            },
            {
                id: "codes",
                label: "Building Codes",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gavel$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Gavel$3e$__["Gavel"],
                keywords: [
                    "ebcs",
                    "regulation",
                    "standards",
                    "compliance"
                ]
            }
        ]
    },
    {
        id: "community",
        label: "Community",
        emoji: "💬",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$messages$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessagesSquare$3e$__["MessagesSquare"],
        items: [
            {
                id: "posts",
                label: "Posts",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$messages$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessagesSquare$3e$__["MessagesSquare"],
                href: "/community",
                hint: "The feed"
            },
            {
                id: "questions",
                label: "Questions",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$life$2d$buoy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LifeBuoy$3e$__["LifeBuoy"],
                href: "/community?kind=question",
                hint: "Ask the industry"
            },
            {
                id: "knowledge",
                label: "Knowledge",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$text$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileText$3e$__["FileText"],
                href: "/community?kind=tip",
                hint: "Tips and field notes"
            },
            {
                id: "tutorials",
                label: "Tutorials",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__["Compass"]
            },
            {
                id: "videos",
                label: "Videos",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$play$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PlayCircle$3e$__["PlayCircle"]
            },
            {
                id: "events",
                label: "Events",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"],
                href: "/events",
                hint: "Trade shows, training, site visits"
            }
        ]
    },
    {
        id: "business",
        label: "Business",
        emoji: "💼",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__["Briefcase"],
        items: [
            {
                id: "dashboard",
                label: "Dashboard",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__["LayoutDashboard"],
                href: "/dashboard",
                private: true
            },
            {
                id: "my-jobs",
                label: "Hiring",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__["Briefcase"],
                href: "/jobs/manage",
                private: true,
                hint: "Your postings and the people who applied",
                keywords: [
                    "jobs",
                    "applicants",
                    "applications",
                    "shortlist",
                    "hire"
                ]
            },
            {
                id: "my-applications",
                label: "My Applications",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"],
                href: "/jobs/applications",
                private: true,
                hint: "Jobs you applied for, and where each one stands",
                keywords: [
                    "applied",
                    "interviews",
                    "hired"
                ]
            },
            {
                id: "quotations",
                label: "Quotations",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__["FileSpreadsheet"],
                href: "/hire",
                private: true,
                hint: "Briefs and the bids on them",
                keywords: [
                    "quotes",
                    "bids",
                    "tender",
                    "rfq"
                ]
            },
            {
                id: "messages",
                label: "Messages",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"],
                href: "/messages",
                private: true
            },
            {
                id: "notifications",
                label: "Notifications",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bell$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bell$3e$__["Bell"],
                href: "/notifications",
                private: true
            },
            {
                id: "orders",
                label: "Orders",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"]
            },
            {
                id: "followers",
                label: "Followers",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"]
            },
            {
                id: "analytics",
                label: "Analytics",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$column$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BarChart3$3e$__["BarChart3"]
            },
            {
                id: "marketing",
                label: "Marketing",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__["Landmark"]
            },
            {
                id: "crm",
                label: "CRM",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$contact$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Contact$3e$__["Contact"]
            },
            {
                id: "invoices",
                label: "Invoices",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$receipt$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Receipt$3e$__["Receipt"]
            },
            {
                id: "payments",
                label: "Payments",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$banknote$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Banknote$3e$__["Banknote"]
            },
            {
                id: "subscriptions",
                label: "Subscriptions",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$credit$2d$card$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CreditCard$3e$__["CreditCard"]
            }
        ]
    },
    // Investment last, deliberately. It is the module people should reach after
    // they understand the rest of the platform, not the first thing a stranger
    // is offered — and every project in it is a demonstration.
    {
        id: "invest",
        label: "Investment",
        emoji: "💰",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__["Landmark"],
        items: [
            {
                id: "invest",
                label: "Opportunities",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__["Landmark"],
                href: "/invest",
                hint: "Development projects raising capital",
                keywords: [
                    "investment",
                    "funding",
                    "roi",
                    "developer",
                    "capital"
                ]
            },
            {
                id: "portfolio",
                label: "Investors",
                icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$line$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LineChart$3e$__["LineChart"],
                href: "/invest/investors",
                hint: "Investor profiles and portfolios",
                keywords: [
                    "portfolio",
                    "holdings",
                    "track record"
                ]
            }
        ]
    }
];
const NAV_ITEMS = NAV_SECTIONS.flatMap((section)=>section.items.map((item)=>({
            ...item,
            section
        })));
const LINKED_NAV_ITEMS = NAV_ITEMS.filter((item)=>typeof item.href === "string" && item.href.length > 0);
const NAV_ROOTS = NAV_SECTIONS.filter((section)=>section.href);
function findSection(id) {
    return NAV_SECTIONS.find((section)=>section.id === id);
}
function findItem(id) {
    return NAV_ITEMS.find((item)=>item.id === id);
}
function matchNavItem(pathname, searchParams) {
    let best;
    let bestScore = -1;
    for (const item of LINKED_NAV_ITEMS){
        const [itemPath = "", itemQuery = ""] = item.href.split("?");
        // Exact route, or a child of it: /marketplace matches /marketplace/abc,
        // but /city must not claim /companies.
        const pathMatches = pathname === itemPath || itemPath !== "/" && pathname.startsWith(`${itemPath}/`);
        if (!pathMatches) continue;
        const wanted = new URLSearchParams(itemQuery);
        let query = 0;
        let satisfied = true;
        for (const [key, value] of wanted){
            if (searchParams?.get(key) !== value) {
                satisfied = false;
                break;
            }
            query += 1;
        }
        if (!satisfied) continue;
        // Longer path beats shorter; more matched query keys beats fewer.
        const score = itemPath.length * 10 + query * 100;
        if (score > bestScore) {
            bestScore = score;
            best = item;
        }
    }
    return best;
}
function breadcrumbsFor(pathname, searchParams, leafLabel) {
    const crumbs = [
        {
            label: "Home",
            href: "/"
        }
    ];
    if (pathname === "/") return crumbs;
    const item = matchNavItem(pathname, searchParams);
    if (!item) {
        // A route outside the manifest — settings, profile, auth callbacks. Show
        // its segments so the trail is never just "Home".
        for (const segment of pathname.split("/").filter(Boolean)){
            crumbs.push({
                label: titleCase(segment)
            });
        }
        return crumbs;
    }
    crumbs.push({
        label: item.section.label,
        href: item.section.href
    });
    crumbs.push({
        label: item.label,
        href: item.href
    });
    // Anything past the item's own path is a record: /marketplace/<id>.
    const [itemPath = ""] = (item.href ?? "").split("?");
    if (pathname.startsWith(`${itemPath}/`)) {
        const rest = pathname.slice(itemPath.length + 1).split("/").filter(Boolean);
        rest.forEach((segment, index)=>{
            const isLeaf = index === rest.length - 1;
            crumbs.push({
                label: isLeaf && leafLabel ? leafLabel : titleCase(segment)
            });
        });
    }
    return crumbs;
}
function titleCase(segment) {
    const decoded = decodeURIComponent(segment);
    // Ids and slugs are shown as-is rather than mangled into fake words.
    if (/^[0-9a-f-]{20,}$/i.test(decoded)) return "Detail";
    return decoded.split("-").map((word)=>word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
}),
"[project]/supabase/migrations/src/components/shell/bottom-nav.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BottomNav",
    ()=>BottomNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bot.mjs [app-ssr] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building-2.mjs [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/calendar-days.mjs [app-ssr] (ecmascript) <export default as CalendarDays>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-ssr] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/house.mjs [app-ssr] (ecmascript) <export default as Home>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$grid$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutGrid$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/layout-grid.mjs [app-ssr] (ecmascript) <export default as LayoutGrid>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$messages$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessagesSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/messages-square.mjs [app-ssr] (ecmascript) <export default as MessagesSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/store.mjs [app-ssr] (ecmascript) <export default as Store>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/trending-up.mjs [app-ssr] (ecmascript) <export default as TrendingUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/truck.mjs [app-ssr] (ecmascript) <export default as Truck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/user.mjs [app-ssr] (ecmascript) <export default as User>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/x.mjs [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
const PRIMARY = [
    {
        href: "/",
        label: "Home",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"]
    },
    {
        href: "/ai",
        label: "AI",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"],
        prefix: "/ai"
    },
    {
        href: "/marketplace",
        label: "Market",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$store$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Store$3e$__["Store"],
        prefix: "/marketplace"
    },
    {
        href: "/city",
        label: "Property",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
        prefix: "/city"
    },
    {
        href: "/community",
        label: "Community",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$messages$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessagesSquare$3e$__["MessagesSquare"],
        prefix: "/community"
    }
];
/** Shown in the sheet above the full module list, because they are the ones
 *  people look for first and would otherwise be four scrolls down. */ const QUICK = [
    {
        href: "/profile",
        label: "Profile",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__User$3e$__["User"]
    },
    {
        href: "/price-exchange",
        label: "Price Exchange",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"]
    },
    {
        href: "/equipment",
        label: "Equipment",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"]
    },
    {
        href: "/events",
        label: "Events",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"]
    }
];
function BottomNav({ signedIn }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const [moreOpen, setMoreOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    function isActive(item) {
        if (item.href === "/") return pathname === "/";
        return pathname === item.href || pathname.startsWith(`${item.prefix ?? item.href}/`);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            moreOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MoreSheet, {
                signedIn: signedIn,
                pathname: pathname,
                onClose: ()=>setMoreOpen(false)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                lineNumber: 76,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                "aria-label": "Main",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden", // Clears the home indicator on an iPhone. Without it the bar's
                // bottom row of pixels sits under the system gesture area.
                "pb-[env(safe-area-inset-bottom)]"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "flex items-stretch",
                    children: [
                        PRIMARY.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "flex-1",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: item.href,
                                    "aria-current": isActive(item) ? "page" : undefined,
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(// 56px is comfortably above the 44px minimum and leaves
                                    // room for a label a thumb can read without a second look.
                                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors", isActive(item) ? "text-brand" : "text-muted-foreground active:text-foreground"),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                            className: "size-5"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                            lineNumber: 107,
                                            columnNumber: 17
                                        }, this),
                                        item.label
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                    lineNumber: 95,
                                    columnNumber: 15
                                }, this)
                            }, item.href, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                lineNumber: 94,
                                columnNumber: 13
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            className: "flex-1",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setMoreOpen(true),
                                "aria-expanded": moreOpen,
                                "aria-label": "More sections",
                                className: "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors active:text-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$grid$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutGrid$3e$__["LayoutGrid"], {
                                        className: "size-5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                        lineNumber: 121,
                                        columnNumber: 15
                                    }, this),
                                    "More"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                lineNumber: 114,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                            lineNumber: 113,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                    lineNumber: 92,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                lineNumber: 83,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
function MoreSheet({ signedIn, pathname, onClose }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-60 lg:hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                "aria-label": "Close",
                onClick: onClose,
                className: "absolute inset-0 cursor-default bg-black/50"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                lineNumber: 142,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "sticky top-0 z-10 flex items-center justify-between bg-background px-4 pt-3 pb-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm font-semibold text-foreground",
                                children: "All of Medosha"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                lineNumber: 153,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClose,
                                "aria-label": "Close",
                                className: "flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "size-5"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                    lineNumber: 162,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                lineNumber: 156,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                        lineNumber: 152,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-4 gap-1 px-3 pb-3",
                        children: QUICK.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: item.href,
                                onClick: onClose,
                                className: "flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] font-medium text-foreground active:bg-muted",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "flex size-11 items-center justify-center rounded-full bg-muted text-brand",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                            className: "size-5"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                            lineNumber: 175,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                        lineNumber: 174,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "line-clamp-2 leading-tight",
                                        children: item.label
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                        lineNumber: 177,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, item.href, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                lineNumber: 168,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                        lineNumber: 166,
                        columnNumber: 9
                    }, this),
                    __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].filter((section)=>section.items.length > 0).map((section)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "px-3 pb-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "flex items-center gap-1.5 px-1 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            "aria-hidden": true,
                                            children: section.emoji
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                            lineNumber: 186,
                                            columnNumber: 17
                                        }, this),
                                        section.label
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                    lineNumber: 185,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    children: section.items.map((item)=>{
                                        const active = item.href ? pathname === item.href || pathname.startsWith(`${item.href}/`) : false;
                                        // An item with no href is a module that is specified but
                                        // not built. It renders as a disabled row rather than a
                                        // link that goes nowhere.
                                        if (!item.href) {
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-muted-foreground/60",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                                            className: "size-4.5 shrink-0"
                                                        }, void 0, false, {
                                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                            lineNumber: 203,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "flex-1 truncate",
                                                            children: item.label
                                                        }, void 0, false, {
                                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                            lineNumber: 204,
                                                            columnNumber: 27
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "rounded-full bg-muted px-1.5 py-0.5 text-[10px]",
                                                            children: "Soon"
                                                        }, void 0, false, {
                                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                            lineNumber: 205,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                    lineNumber: 202,
                                                    columnNumber: 25
                                                }, this)
                                            }, item.id, false, {
                                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                lineNumber: 201,
                                                columnNumber: 23
                                            }, this);
                                        }
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                href: item.private && !signedIn ? `/login?redirect=${encodeURIComponent(item.href)}` : item.href,
                                                onClick: onClose,
                                                "aria-current": active ? "page" : undefined,
                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-11 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors active:bg-muted", active ? "bg-brand/10 font-medium text-brand" : "text-foreground"),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                                        className: "size-4.5 shrink-0"
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                        lineNumber: 230,
                                                        columnNumber: 25
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "flex-1 truncate",
                                                        children: item.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                        lineNumber: 231,
                                                        columnNumber: 25
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                                        className: "size-4 shrink-0 text-muted-foreground"
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                        lineNumber: 232,
                                                        columnNumber: 25
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                                lineNumber: 215,
                                                columnNumber: 23
                                            }, this)
                                        }, item.id, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                            lineNumber: 214,
                                            columnNumber: 21
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                                    lineNumber: 189,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, section.id, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                            lineNumber: 184,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
                lineNumber: 149,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/bottom-nav.tsx",
        lineNumber: 141,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/search/kind-icon.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SearchKindIcon",
    ()=>SearchKindIcon
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/armchair.mjs [app-ssr] (ecmascript) <export default as Armchair>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/briefcase.mjs [app-ssr] (ecmascript) <export default as Briefcase>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building-2.mjs [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/calendar-days.mjs [app-ssr] (ecmascript) <export default as CalendarDays>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hammer$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hammer$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hammer.mjs [app-ssr] (ecmascript) <export default as Hammer>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hash.mjs [app-ssr] (ecmascript) <export default as Hash>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/landmark.mjs [app-ssr] (ecmascript) <export default as Landmark>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$line$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LineChart$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chart-line.mjs [app-ssr] (ecmascript) <export default as LineChart>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/message-square.mjs [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/package.mjs [app-ssr] (ecmascript) <export default as Package>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/truck.mjs [app-ssr] (ecmascript) <export default as Truck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-ssr] (ecmascript) <export default as UserRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/wrench.mjs [app-ssr] (ecmascript) <export default as Wrench>");
;
;
/**
 * The icon for a search result's kind.
 *
 * A lookup table rather than a dynamic import per name: the set is fixed at
 * small and fixed, and importing them statically lets the bundler keep only
 * these.
 */ const ICONS = {
    product: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"],
    company: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
    professional: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__["UserRound"],
    project: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hammer$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hammer$3e$__["Hammer"],
    price: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chart$2d$line$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LineChart$3e$__["LineChart"],
    service: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__["Wrench"],
    equipment: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$truck$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Truck$3e$__["Truck"],
    job: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$briefcase$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Briefcase$3e$__["Briefcase"],
    event: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"],
    post: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"],
    hashtag: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hash$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Hash$3e$__["Hash"],
    investment: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$landmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Landmark$3e$__["Landmark"],
    design: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__["Armchair"]
};
function SearchKindIcon({ kind, className }) {
    const Icon = ICONS[kind] ?? __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
        className: className,
        "aria-hidden": true
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/search/kind-icon.tsx",
        lineNumber: 51,
        columnNumber: 10
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/quick-actions.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "QUICK_CREATE",
    ()=>QUICK_CREATE,
    "QuickActions",
    ()=>QuickActions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/file-spreadsheet.mjs [app-ssr] (ecmascript) <export default as FileSpreadsheet>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/hard-hat.mjs [app-ssr] (ecmascript) <export default as HardHat>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/house.mjs [app-ssr] (ecmascript) <export default as Home>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/package.mjs [app-ssr] (ecmascript) <export default as Package>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/plus.mjs [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/trending-up.mjs [app-ssr] (ecmascript) <export default as TrendingUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/wrench.mjs [app-ssr] (ecmascript) <export default as Wrench>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
const QUICK_CREATE = [
    {
        id: "product",
        label: "Create Product",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$package$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Package$3e$__["Package"],
        href: "/products/new",
        hint: "List something for sale",
        keywords: "new product listing sell item"
    },
    {
        id: "project",
        label: "Create Project",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$hat$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__HardHat$3e$__["HardHat"],
        href: "/projects/new",
        hint: "Publish a build",
        keywords: "new project build portfolio"
    },
    {
        id: "property",
        label: "Create Property",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$house$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Home$3e$__["Home"],
        href: "/property/new",
        hint: "List a property on the city map",
        keywords: "new property listing house land sell rent"
    },
    {
        id: "service",
        label: "Create Service",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__["Wrench"],
        href: "/dashboard/services/new",
        hint: "Offer a trade or specialism",
        keywords: "new service offer trade profession"
    },
    {
        id: "quote",
        label: "Request Quote",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__["FileSpreadsheet"],
        href: "/hire/new",
        hint: "Post a brief and collect bids",
        keywords: "rfq tender brief bids hire quotation"
    }
];
/** Actions the palette cannot run because the module does not exist yet. */ const PENDING = [
    {
        id: "price",
        label: "Post Price",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"],
        hint: "Publish a rate to the exchange"
    }
];
function QuickActions() {
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const root = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        function onPointerDown(event) {
            if (!root.current?.contains(event.target)) setOpen(false);
        }
        function onKeyDown(event) {
            if (event.key === "Escape") setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return ()=>{
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [
        open
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: root,
        className: "pointer-events-auto relative",
        children: [
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "glass absolute right-0 bottom-14 w-64 overflow-hidden rounded-2xl border p-1.5 shadow-2xl",
                children: [
                    QUICK_CREATE.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: action.href,
                            onClick: ()=>setOpen(false),
                            className: "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(action.icon, {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                        lineNumber: 129,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 128,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "block truncate font-medium",
                                            children: action.label
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                            lineNumber: 132,
                                            columnNumber: 17
                                        }, this),
                                        action.hint && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "block truncate text-xs text-muted-foreground",
                                            children: action.hint
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                            lineNumber: 134,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 131,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, action.id, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                            lineNumber: 122,
                            columnNumber: 13
                        }, this)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"])();
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                aiOpen: true
                            });
                            setOpen(false);
                        },
                        className: "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                    className: "size-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 152,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                lineNumber: 151,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "block truncate font-medium",
                                        children: "Ask AI"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                        lineNumber: 155,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "block truncate text-xs text-muted-foreground",
                                        children: "Without leaving this page"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                        lineNumber: 156,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                lineNumber: 154,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                        lineNumber: 142,
                        columnNumber: 11
                    }, this),
                    PENDING.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            "aria-disabled": true,
                            title: `${action.label} — not built yet`,
                            className: "flex cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground/50",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(action.icon, {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                        lineNumber: 170,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 169,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "min-w-0 flex-1 truncate",
                                    children: action.label
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 172,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
                                    children: "Soon"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                                    lineNumber: 173,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, action.id, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                            lineNumber: 163,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                lineNumber: 120,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((previous)=>!previous),
                "aria-expanded": open,
                "aria-label": "Quick actions",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("ml-auto flex size-12 items-center justify-center rounded-full shadow-lg transition-all", "bg-brand text-brand-foreground hover:-translate-y-0.5 hover:shadow-xl", "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", open && "rotate-45"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                    className: "size-5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                    lineNumber: 193,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
                lineNumber: 181,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/quick-actions.tsx",
        lineNumber: 118,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/command-palette.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CommandPalette",
    ()=>CommandPalette
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/arrow-right.mjs [app-ssr] (ecmascript) <export default as ArrowRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$corner$2d$down$2d$left$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CornerDownLeft$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/corner-down-left.mjs [app-ssr] (ecmascript) <export default as CornerDownLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/plus.mjs [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/search.mjs [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$kind$2d$icon$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/search/kind-icon.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$quick$2d$actions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/quick-actions.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
function CommandPalette() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    // Results carry the term they answered. Rendering is then a comparison
    // rather than a cleanup: a stale set simply stops matching and is ignored,
    // so nothing has to be cleared from inside an effect.
    const [results, setResults] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        term: "",
        rows: []
    });
    const [busyFor, setBusyFor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [active, setActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const listRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useHotkey"])("mod+k", (event)=>{
        event.preventDefault();
        setOpen((previous)=>!previous);
    });
    // Remote content search. Debounced, and every in-flight request is dropped
    // the moment the query moves on.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const term = query.trim();
        if (!open || term.length < 2) return;
        const controller = new AbortController();
        const timer = setTimeout(async ()=>{
            setBusyFor(term);
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(String(response.status));
                const payload = await response.json();
                setResults({
                    term,
                    rows: payload.results ?? []
                });
            } catch (error) {
                // An abort is the normal path, not a failure worth reporting.
                if (error?.name !== "AbortError") {
                    setResults({
                        term,
                        rows: []
                    });
                }
            } finally{
                if (!controller.signal.aborted) setBusyFor(null);
            }
        }, 160);
        return ()=>{
            clearTimeout(timer);
            controller.abort();
        };
    }, [
        query,
        open
    ]);
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const term = query.trim().toLowerCase();
        const pages = __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LINKED_NAV_ITEMS"].filter((item)=>{
            if (!term) return true;
            const haystack = [
                item.label,
                item.section.label,
                item.hint ?? "",
                ...item.keywords ?? []
            ].join(" ").toLowerCase();
            return haystack.includes(term);
        }).slice(0, term ? 6 : 8).map((item)=>({
                type: "page",
                id: `page:${item.id}`,
                label: item.label,
                hint: item.hint,
                href: item.href,
                section: item.section.label
            }));
        const creates = __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$quick$2d$actions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QUICK_CREATE"].filter((action)=>term ? `${action.label} ${action.keywords ?? ""}`.toLowerCase().includes(term) : false).slice(0, 4).map((action)=>({
                type: "create",
                id: `create:${action.id}`,
                label: action.label,
                hint: action.hint,
                href: action.href
            }));
        // Only the set that answered the current term. Anything older is stale by
        // definition and would put another query's results under this one.
        const content = results.term === query.trim() ? results.rows.slice(0, 8).map((result)=>({
                type: "result",
                id: `result:${result.kind}:${result.id}`,
                result
            })) : [];
        const tail = term ? [
            {
                type: "ai",
                id: "ai",
                query: term
            },
            {
                type: "search",
                id: "search",
                query: term
            }
        ] : [];
        return [
            ...pages,
            ...creates,
            ...content,
            ...tail
        ];
    }, [
        query,
        results
    ]);
    // Clamp rather than reset: the highlight should survive results arriving.
    const index = Math.min(active, Math.max(0, rows.length - 1));
    function run(row) {
        setOpen(false);
        setQuery("");
        setActive(0);
        switch(row.type){
            case "page":
            case "create":
                router.push(row.href);
                break;
            case "result":
                router.push(row.result.href);
                break;
            case "ai":
                // Opens the dock rather than navigating, so the workspace is kept.
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"])();
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                    aiOpen: true
                });
                router.push(`/ai?q=${encodeURIComponent(row.query)}`);
                break;
            case "search":
                router.push(`/search?q=${encodeURIComponent(row.query)}`);
                break;
        }
    }
    function onKeyDown(event) {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((previous)=>(previous + 1) % Math.max(1, rows.length));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((previous)=>(previous - 1 + rows.length) % Math.max(1, rows.length));
            return;
        }
        if (event.key === "Enter" && rows[index]) {
            event.preventDefault();
            run(rows[index]);
        }
    }
    if (!open) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-100 flex items-start justify-center p-4 pt-[12vh]",
        role: "dialog",
        "aria-modal": true,
        "aria-label": "Command palette",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                "aria-label": "Close command palette",
                onClick: ()=>setOpen(false),
                className: "absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 214,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "glass relative w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-3 border-b px-4",
                        children: [
                            busyFor !== null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                className: "size-4 shrink-0 animate-spin text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 224,
                                columnNumber: 13
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                className: "size-4 shrink-0 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 226,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                autoFocus: true,
                                value: query,
                                onChange: (event)=>{
                                    setQuery(event.target.value);
                                    setActive(0);
                                },
                                onKeyDown: onKeyDown,
                                placeholder: "Search pages, products, companies, properties, people…",
                                className: "h-13 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 230,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                className: "shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground",
                                children: "Esc"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 241,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                        lineNumber: 222,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        ref: listRef,
                        className: "max-h-96 overflow-y-auto p-2",
                        children: [
                            rows.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "px-3 py-8 text-center text-sm text-muted-foreground",
                                children: [
                                    "Nothing matches “",
                                    query.trim(),
                                    "”."
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 248,
                                columnNumber: 13
                            }, this),
                            rows.map((row, position)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onMouseEnter: ()=>setActive(position),
                                    onClick: ()=>run(row),
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", position === index ? "bg-muted" : "hover:bg-muted/60"),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RowIcon, {
                                            row: row
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                            lineNumber: 264,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "min-w-0 flex-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "block truncate font-medium",
                                                    children: rowTitle(row)
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                                    lineNumber: 266,
                                                    columnNumber: 17
                                                }, this),
                                                rowHint(row) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "block truncate text-xs text-muted-foreground",
                                                    children: rowHint(row)
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                                    lineNumber: 270,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                            lineNumber: 265,
                                            columnNumber: 15
                                        }, this),
                                        position === index && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$corner$2d$down$2d$left$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CornerDownLeft$3e$__["CornerDownLeft"], {
                                            className: "size-3.5 shrink-0 text-muted-foreground"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                            lineNumber: 276,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, row.id, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                    lineNumber: 254,
                                    columnNumber: 13
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                        lineNumber: 246,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex items-center gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                        className: "rounded border px-1",
                                        children: "↑"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                        lineNumber: 284,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                        className: "rounded border px-1",
                                        children: "↓"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                        lineNumber: 285,
                                        columnNumber: 13
                                    }, this),
                                    " navigate"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 283,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "flex items-center gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                        className: "rounded border px-1",
                                        children: "↵"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                        lineNumber: 288,
                                        columnNumber: 13
                                    }, this),
                                    " open"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 287,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ml-auto flex items-center gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                        className: "rounded border px-1",
                                        children: "⌘"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                        lineNumber: 291,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                                        className: "rounded border px-1",
                                        children: "K"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                        lineNumber: 292,
                                        columnNumber: 13
                                    }, this),
                                    " toggle"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                                lineNumber: 290,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                        lineNumber: 282,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 221,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
        lineNumber: 208,
        columnNumber: 5
    }, this);
}
function RowIcon({ row }) {
    const box = "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground";
    switch(row.type){
        case "result":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: box,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$kind$2d$icon$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SearchKindIcon"], {
                    kind: row.result.kind,
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                    lineNumber: 307,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 306,
                columnNumber: 9
            }, this);
        case "create":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(box, "bg-brand/12 text-brand"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                    lineNumber: 313,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 312,
                columnNumber: 9
            }, this);
        case "ai":
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(box, "bg-brand/12 text-brand"),
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                    lineNumber: 319,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 318,
                columnNumber: 9
            }, this);
        default:
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: box,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowRight$3e$__["ArrowRight"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                    lineNumber: 325,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/command-palette.tsx",
                lineNumber: 324,
                columnNumber: 9
            }, this);
    }
}
function rowTitle(row) {
    switch(row.type){
        case "result":
            return row.result.title;
        case "ai":
            return `Ask Medosha AI about “${row.query}”`;
        case "search":
            return `Search everything for “${row.query}”`;
        default:
            return row.label;
    }
}
function rowHint(row) {
    switch(row.type){
        case "page":
            return row.hint ? `${row.section} · ${row.hint}` : row.section;
        case "result":
            return row.result.subtitle ?? undefined;
        case "create":
            return row.hint;
        default:
            return undefined;
    }
}
}),
"[project]/supabase/migrations/src/components/ai/markdown.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Markdown",
    ()=>Markdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function splitRow(line) {
    return line.replace(/^\||\|$/g, "").split("|").map((cell)=>cell.trim());
}
function parse(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    /**
   * The line at an index, or "" past the end.
   *
   * Every read below sits inside a `index < lines.length` loop and is provably
   * in bounds — but the compiler cannot see that, and sprinkling non-null
   * assertions through a parser is how an off-by-one becomes a crash on a
   * half-streamed answer. One accessor, no assertions, same behaviour.
   */ const at = (position)=>lines[position] ?? "";
    const blocks = [];
    let index = 0;
    while(index < lines.length){
        const line = at(index);
        if (line.trim() === "") {
            index += 1;
            continue;
        }
        // Fenced code. An unterminated fence still renders, so a streaming answer
        // shows its code block while it is being written.
        if (line.trimStart().startsWith("```")) {
            const language = line.trim().slice(3).trim();
            const code = [];
            index += 1;
            while(index < lines.length && !at(index).trimStart().startsWith("```")){
                code.push(at(index));
                index += 1;
            }
            index += 1;
            blocks.push({
                kind: "code",
                language,
                code: code.join("\n")
            });
            continue;
        }
        if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
            blocks.push({
                kind: "rule"
            });
            index += 1;
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            // Both groups are mandatory in the pattern, so a match always has them;
            // the defaults exist to say so to the compiler rather than to assert it.
            const [, hashes = "#", text = ""] = heading;
            blocks.push({
                kind: "heading",
                level: hashes.length <= 2 ? 2 : 3,
                text
            });
            index += 1;
            continue;
        }
        // Table: a header row followed by a separator of dashes.
        if (line.includes("|") && index + 1 < lines.length && /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(at(index + 1))) {
            const header = splitRow(line);
            index += 2;
            const rows = [];
            while(index < lines.length && at(index).includes("|")){
                rows.push(splitRow(at(index)));
                index += 1;
            }
            blocks.push({
                kind: "table",
                header,
                rows
            });
            continue;
        }
        const bulletMatch = /^\s*[-*+]\s+/.test(line);
        const orderedMatch = /^\s*\d+[.)]\s+/.test(line);
        if (bulletMatch || orderedMatch) {
            const ordered = orderedMatch && !bulletMatch;
            const items = [];
            while(index < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(at(index)) : /^\s*[-*+]\s+/.test(at(index)))){
                items.push(at(index).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
                index += 1;
            }
            blocks.push({
                kind: "list",
                ordered,
                items
            });
            continue;
        }
        const paragraph = [];
        while(index < lines.length && at(index).trim() !== "" && !at(index).trimStart().startsWith("```") && !/^(#{1,6})\s+/.test(at(index)) && !/^\s*[-*+]\s+/.test(at(index)) && !/^\s*\d+[.)]\s+/.test(at(index))){
            paragraph.push(at(index));
            index += 1;
        }
        blocks.push({
            kind: "paragraph",
            text: paragraph.join(" ")
        });
    }
    return blocks;
}
/** Renders bold, inline code and links inside a line of text. */ function Inline({ text }) {
    const parts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g;
        const out = [];
        let cursor = 0;
        let match;
        let key = 0;
        while((match = pattern.exec(text)) !== null){
            if (match.index > cursor) out.push(text.slice(cursor, match.index));
            const token = match[0];
            if (token.startsWith("**")) {
                out.push(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    children: token.slice(2, -2)
                }, key++, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 156,
                    columnNumber: 18
                }, this));
            } else if (token.startsWith("`")) {
                out.push(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                    className: "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
                    children: token.slice(1, -1)
                }, key++, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 159,
                    columnNumber: 11
                }, this));
            } else {
                const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token);
                if (link) {
                    out.push(/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                        href: link[2],
                        className: "font-medium text-brand underline underline-offset-2",
                        children: link[1]
                    }, key++, false, {
                        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                        lineNumber: 170,
                        columnNumber: 13
                    }, this));
                }
            }
            cursor = match.index + token.length;
        }
        if (cursor < text.length) out.push(text.slice(cursor));
        return out;
    }, [
        text
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
        children: parts
    }, void 0, false);
}
function Markdown({ content }) {
    const blocks = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>parse(content), [
        content
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3 text-sm leading-relaxed",
        children: blocks.map((block, i)=>{
            if (block.kind === "heading") {
                const Tag = block.level === 2 ? "h2" : "h3";
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tag, {
                    className: block.level === 2 ? "mt-2 text-base font-semibold" : "mt-2 text-sm font-semibold",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Inline, {
                        text: block.text
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                        lineNumber: 207,
                        columnNumber: 15
                    }, this)
                }, i, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 199,
                    columnNumber: 13
                }, this);
            }
            if (block.kind === "rule") {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                    className: "border-border"
                }, i, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 213,
                    columnNumber: 18
                }, this);
            }
            if (block.kind === "code") {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                    className: "overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                        children: block.code
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                        lineNumber: 222,
                        columnNumber: 15
                    }, this)
                }, i, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 218,
                    columnNumber: 13
                }, this);
            }
            if (block.kind === "list") {
                const Tag = block.ordered ? "ol" : "ul";
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tag, {
                    className: block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5",
                    children: block.items.map((item, j)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Inline, {
                                text: item
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                lineNumber: 240,
                                columnNumber: 19
                            }, this)
                        }, j, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                            lineNumber: 239,
                            columnNumber: 17
                        }, this))
                }, i, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 230,
                    columnNumber: 13
                }, this);
            }
            if (block.kind === "table") {
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "overflow-x-auto rounded-lg border",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                        className: "w-full border-collapse text-xs",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                className: "bg-muted/60",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                    children: block.header.map((cell, j)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                            className: "px-3 py-2 text-left font-semibold",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Inline, {
                                                text: cell
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                                lineNumber: 255,
                                                columnNumber: 25
                                            }, this)
                                        }, j, false, {
                                            fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                            lineNumber: 254,
                                            columnNumber: 23
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                    lineNumber: 252,
                                    columnNumber: 19
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                lineNumber: 251,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                children: block.rows.map((row, j)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                        className: "border-t",
                                        children: row.map((cell, k)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                className: "px-3 py-2 align-top",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Inline, {
                                                    text: cell
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                                    lineNumber: 265,
                                                    columnNumber: 27
                                                }, this)
                                            }, k, false, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                                lineNumber: 264,
                                                columnNumber: 25
                                            }, this))
                                    }, j, false, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                        lineNumber: 262,
                                        columnNumber: 21
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                                lineNumber: 260,
                                columnNumber: 17
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                        lineNumber: 250,
                        columnNumber: 15
                    }, this)
                }, i, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 249,
                    columnNumber: 13
                }, this);
            }
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Inline, {
                    text: block.text
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                    lineNumber: 278,
                    columnNumber: 13
                }, this)
            }, i, false, {
                fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
                lineNumber: 277,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ai/markdown.tsx",
        lineNumber: 194,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/ai/quick-actions.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Quick actions shown on the landing page and above an empty chat.
 *
 * Client-safe: this is presentation data only, so it carries no provider or
 * database access and can be imported from a client component.
 */ __turbopack_context__.s([
    "QUICK_ACTIONS",
    ()=>QUICK_ACTIONS,
    "SUGGESTED_PROMPTS",
    ()=>SUGGESTED_PROMPTS
]);
const QUICK_ACTIONS = [
    {
        agent: "cost",
        title: "Construction Cost Estimator",
        description: "Budget a build with stated assumptions.",
        prompt: "Estimate the cost of a 200m² villa in Addis Ababa to a standard finish.",
        icon: "Calculator"
    },
    {
        agent: "boq",
        title: "AI BOQ Generator",
        description: "Draft a preliminary bill of quantities.",
        prompt: "Generate a preliminary BOQ for a 150m² two-storey residential house.",
        icon: "ClipboardList"
    },
    {
        agent: "materials",
        title: "Material Advisor",
        description: "Compare materials and specifications.",
        prompt: "Compare UPVC vs aluminium windows for a house in Addis Ababa.",
        icon: "Layers"
    },
    {
        agent: "marketplace",
        title: "Supplier Finder",
        description: "Find products and suppliers on Medosha.",
        prompt: "Find flooring suppliers in Addis Ababa.",
        icon: "Store"
    },
    {
        agent: "professionals",
        title: "Professional Finder",
        description: "Find architects, engineers and designers.",
        prompt: "Find architects near me who work on residential villas.",
        icon: "Users"
    },
    {
        agent: "planner",
        title: "Project Planner",
        description: "Phases, durations and the critical path.",
        prompt: "Generate a construction schedule for a 6-month villa build.",
        icon: "CalendarRange"
    },
    {
        agent: "render",
        title: "Interior Design Assistant",
        description: "Palettes, materials and furniture.",
        prompt: "Suggest modern interior colours for a living room with south-facing windows.",
        icon: "Palette"
    },
    {
        agent: "render",
        title: "Architecture Assistant",
        description: "Massing, orientation and facades.",
        prompt: "How should I orient and shade a villa in Addis Ababa for the climate?",
        icon: "Building2"
    },
    {
        agent: "render",
        title: "Rendering Assistant",
        description: "Write a prompt for a visualisation.",
        prompt: "Write a rendering prompt for a modern Ethiopian villa at golden hour.",
        icon: "Camera"
    },
    {
        agent: "drawings",
        title: "Drawing Analyzer",
        description: "Drawing types, conventions and reviews.",
        prompt: "What should a structural drawing set contain for a two-storey house?",
        icon: "FileText"
    },
    {
        agent: "drawings",
        title: "Building Code Assistant",
        description: "EBCS requirements and permits.",
        prompt: "What are the EBCS setback and height rules for a residential plot?",
        icon: "Scale"
    },
    {
        agent: "construction",
        title: "Construction Calculator",
        description: "Quantities, mixes and conversions.",
        prompt: "How many cement bags and how much sand for 10m³ of C-25 concrete?",
        icon: "Ruler"
    }
];
const SUGGESTED_PROMPTS = [
    "Estimate the cost of a 200m² villa",
    "Find flooring suppliers in Addis Ababa",
    "Recommend kitchen cabinet materials",
    "Generate a preliminary BOQ",
    "Find architects near me",
    "Compare UPVC vs Aluminum windows",
    "Suggest modern interior colors",
    "Generate a construction schedule",
    "Create a material list",
    "Recommend lighting for a hotel"
];
}),
"[project]/supabase/migrations/src/components/ai/ai-chat.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AiChat",
    ()=>AiChat
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/arrow-up.mjs [app-ssr] (ecmascript) <export default as ArrowUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/check.mjs [app-ssr] (ecmascript) <export default as Check>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/copy.mjs [app-ssr] (ecmascript) <export default as Copy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eraser$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Eraser$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/eraser.mjs [app-ssr] (ecmascript) <export default as Eraser>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/refresh-cw.mjs [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/square.mjs [app-ssr] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$markdown$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ai/markdown.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$quick$2d$actions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/ai/quick-actions.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
function AiChat({ initialPrompt, agent, compact }) {
    const [turns, setTurns] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [draft, setDraft] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialPrompt ?? "");
    const [streaming, setStreaming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copiedId, setCopiedId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const abortRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const bottomRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const textareaRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    // The last question, so Regenerate can re-ask without the failed answer.
    const lastQuestion = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const suggestions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$quick$2d$actions$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SUGGESTED_PROMPTS"].slice(0, 6), []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        bottomRef.current?.scrollIntoView({
            block: "end",
            behavior: "smooth"
        });
    }, [
        turns
    ]);
    const ask = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (question, history)=>{
        const controller = new AbortController();
        abortRef.current = controller;
        setStreaming(true);
        setError(null);
        lastQuestion.current = question;
        const answerId = `a-${crypto.randomUUID()}`;
        setTurns([
            ...history,
            {
                id: `q-${crypto.randomUUID()}`,
                role: "user",
                content: question
            },
            {
                id: answerId,
                role: "assistant",
                content: ""
            }
        ]);
        try {
            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                signal: controller.signal,
                body: JSON.stringify({
                    question,
                    agent,
                    history: history.map((t)=>({
                            role: t.role,
                            content: t.content
                        }))
                })
            });
            if (!response.ok || !response.body) {
                const payload = await response.json().catch(()=>null);
                throw new Error(payload?.error ?? "Medosha AI is unavailable.");
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while(true){
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {
                    stream: true
                });
                // Frames are separated by a blank line; keep any partial tail.
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";
                for (const raw of frames){
                    const eventLine = raw.split("\n").find((l)=>l.startsWith("event:"));
                    const dataLine = raw.split("\n").find((l)=>l.startsWith("data:"));
                    if (!eventLine || !dataLine) continue;
                    const event = eventLine.slice(6).trim();
                    const data = JSON.parse(dataLine.slice(5).trim());
                    if (event === "meta") {
                        const meta = data;
                        setTurns((prev)=>prev.map((t)=>t.id === answerId ? {
                                    ...t,
                                    agentLabel: meta.agentLabel,
                                    sources: meta.sources
                                } : t));
                    } else if (event === "delta") {
                        const delta = data;
                        setTurns((prev)=>prev.map((t)=>t.id === answerId ? {
                                    ...t,
                                    content: t.content + delta.text
                                } : t));
                    } else if (event === "error") {
                        setError(data.message);
                    }
                }
            }
        } catch (caught) {
            if (!controller.signal.aborted) {
                setError(caught instanceof Error ? caught.message : "Something went wrong.");
            }
        } finally{
            setStreaming(false);
            abortRef.current = null;
        }
    }, [
        agent
    ]);
    function submit() {
        const question = draft.trim();
        if (!question || streaming) return;
        setDraft("");
        void ask(question, turns);
    }
    function stop() {
        abortRef.current?.abort();
        setStreaming(false);
    }
    function regenerate() {
        const question = lastQuestion.current;
        if (!question || streaming) return;
        // Drop the previous exchange so the model answers fresh rather than
        // continuing from its own failed attempt.
        void ask(question, turns.slice(0, -2));
    }
    async function copy(turn) {
        await navigator.clipboard.writeText(turn.content);
        setCopiedId(turn.id);
        setTimeout(()=>setCopiedId(null), 1500);
    }
    const empty = turns.length === 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex min-h-0 flex-col", compact ? "h-full" : "h-full"),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1 overflow-y-auto",
                children: empty ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mx-auto max-w-2xl px-4 py-10 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-brand",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                className: "size-5"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 186,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                            lineNumber: 185,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-4 font-medium",
                            children: "Ask Medosha AI anything"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                            lineNumber: 188,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-sm text-muted-foreground",
                            children: "Costs, materials, suppliers, schedules and design — grounded in the Medosha catalogue."
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                            lineNumber: 189,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-6 flex flex-wrap justify-center gap-2",
                            children: suggestions.map((prompt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>void ask(prompt, []),
                                    className: "rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground",
                                    children: prompt
                                }, prompt, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                    lineNumber: 195,
                                    columnNumber: 17
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                            lineNumber: 193,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                    lineNumber: 184,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mx-auto max-w-3xl space-y-6 px-4 py-6",
                    children: [
                        turns.map((turn)=>turn.role === "user" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-end",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground",
                                    children: turn.content
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                    lineNumber: 211,
                                    columnNumber: 19
                                }, this)
                            }, turn.id, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 210,
                                columnNumber: 17
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-2",
                                children: [
                                    turn.agentLabel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "flex items-center gap-1.5 text-xs font-medium text-brand",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                className: "size-3"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                lineNumber: 219,
                                                columnNumber: 23
                                            }, this),
                                            turn.agentLabel
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                        lineNumber: 218,
                                        columnNumber: 21
                                    }, this),
                                    turn.content ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$markdown$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Markdown"], {
                                        content: turn.content
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                        lineNumber: 225,
                                        columnNumber: 21
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1 py-2",
                                        children: [
                                            0,
                                            150,
                                            300
                                        ].map((delay)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "size-1.5 animate-bounce rounded-full bg-muted-foreground/60",
                                                style: {
                                                    animationDelay: `${delay}ms`
                                                }
                                            }, delay, false, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                lineNumber: 229,
                                                columnNumber: 25
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                        lineNumber: 227,
                                        columnNumber: 21
                                    }, this),
                                    turn.sources && turn.sources.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-1.5 pt-1",
                                        children: turn.sources.slice(0, 6).map((source)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                href: source.href,
                                                className: "rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground",
                                                children: source.title
                                            }, `${source.kind}-${source.id}`, false, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                lineNumber: 241,
                                                columnNumber: 25
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                        lineNumber: 239,
                                        columnNumber: 21
                                    }, this),
                                    turn.content && !streaming && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-1 pt-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>void copy(turn),
                                                className: "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                                children: [
                                                    copiedId === turn.id ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Check$3e$__["Check"], {
                                                        className: "size-3"
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                        lineNumber: 260,
                                                        columnNumber: 27
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {
                                                        className: "size-3"
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                        lineNumber: 262,
                                                        columnNumber: 27
                                                    }, this),
                                                    copiedId === turn.id ? "Copied" : "Copy"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                lineNumber: 254,
                                                columnNumber: 23
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: regenerate,
                                                className: "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                                        className: "size-3"
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                        lineNumber: 271,
                                                        columnNumber: 25
                                                    }, this),
                                                    "Regenerate"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                                lineNumber: 266,
                                                columnNumber: 23
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                        lineNumber: 253,
                                        columnNumber: 21
                                    }, this)
                                ]
                            }, turn.id, true, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 216,
                                columnNumber: 17
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: bottomRef
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                            lineNumber: 279,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                    lineNumber: 207,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                lineNumber: 182,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mx-auto w-full max-w-3xl px-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive",
                    children: error
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                    lineNumber: 286,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                lineNumber: 285,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                onSubmit: (event)=>{
                    event.preventDefault();
                    submit();
                },
                className: "mx-auto w-full max-w-3xl px-4 py-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                ref: textareaRef,
                                value: draft,
                                rows: 1,
                                placeholder: "Ask about costs, materials, suppliers, schedules…",
                                onChange: (event)=>{
                                    setDraft(event.target.value);
                                    const el = event.target;
                                    el.style.height = "auto";
                                    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                                },
                                onKeyDown: (event)=>{
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        submit();
                                    }
                                },
                                className: "max-h-44 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 300,
                                columnNumber: 11
                            }, this),
                            turns.length > 0 && !streaming && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>{
                                    setTurns([]);
                                    setError(null);
                                    lastQuestion.current = null;
                                },
                                "aria-label": "Clear conversation",
                                className: "flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eraser$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Eraser$3e$__["Eraser"], {
                                    className: "size-4"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                    lineNumber: 331,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 321,
                                columnNumber: 13
                            }, this),
                            streaming ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: stop,
                                "aria-label": "Stop generating",
                                className: "flex size-9 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-muted/70",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                    className: "size-3.5 fill-current"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                    lineNumber: 342,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 336,
                                columnNumber: 13
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "submit",
                                disabled: draft.trim().length === 0,
                                "aria-label": "Send",
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex size-9 items-center justify-center rounded-xl transition-all", "bg-primary text-primary-foreground hover:bg-primary/85", "disabled:pointer-events-none disabled:opacity-40"),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$up$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowUp$3e$__["ArrowUp"], {
                                    className: "size-4"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                    lineNumber: 355,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                                lineNumber: 345,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                        lineNumber: 299,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "pt-2 text-center text-[11px] text-muted-foreground",
                        children: "Medosha AI gives planning guidance, not certified engineering sign-off."
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                        lineNumber: 359,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
                lineNumber: 292,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/ai/ai-chat.tsx",
        lineNumber: 181,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/constants/placeholders.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Branded Medosha placeholder images, stored locally in public/images.
// Used whenever a record has no image of its own — the app never requests a
// placeholder from an external service.
__turbopack_context__.s([
    "AVATAR_PLACEHOLDER",
    ()=>AVATAR_PLACEHOLDER,
    "COMPANY_PLACEHOLDER",
    ()=>COMPANY_PLACEHOLDER,
    "COVER_PLACEHOLDER",
    ()=>COVER_PLACEHOLDER,
    "PRODUCT_PLACEHOLDER",
    ()=>PRODUCT_PLACEHOLDER,
    "PROJECT_PLACEHOLDER",
    ()=>PROJECT_PLACEHOLDER
]);
const PRODUCT_PLACEHOLDER = "/images/placeholders/product.svg";
const PROJECT_PLACEHOLDER = "/images/placeholders/project.svg";
const COMPANY_PLACEHOLDER = "/images/placeholders/company.svg";
const AVATAR_PLACEHOLDER = "/images/placeholders/avatar.svg";
const COVER_PLACEHOLDER = "/images/placeholders/cover.svg";
}),
"[project]/supabase/migrations/src/lib/constants/properties.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AMENITIES",
    ()=>AMENITIES,
    "AREA_BANDS",
    ()=>AREA_BANDS,
    "BEDROOM_OPTIONS",
    ()=>BEDROOM_OPTIONS,
    "FURNISHING",
    ()=>FURNISHING,
    "LAND_TYPES",
    ()=>LAND_TYPES,
    "LISTING_KIND",
    ()=>LISTING_KIND,
    "NEARBY_GROUPS",
    ()=>NEARBY_GROUPS,
    "PLACE_KIND",
    ()=>PLACE_KIND,
    "PRICE_BANDS",
    ()=>PRICE_BANDS,
    "PROPERTY_MEDIA_KIND",
    ()=>PROPERTY_MEDIA_KIND,
    "PROPERTY_STATUS",
    ()=>PROPERTY_STATUS,
    "PROPERTY_TYPE",
    ()=>PROPERTY_TYPE,
    "PROPERTY_TYPES",
    ()=>PROPERTY_TYPES,
    "PROPERTY_TYPE_GROUPS",
    ()=>PROPERTY_TYPE_GROUPS,
    "isLandType",
    ()=>isLandType,
    "isListingKind",
    ()=>isListingKind,
    "isPropertyType",
    ()=>isPropertyType,
    "shortPrice",
    ()=>shortPrice
]);
const PROPERTY_TYPE = {
    apartment: {
        label: "Apartment",
        group: "residential"
    },
    villa: {
        label: "Villa",
        group: "residential"
    },
    house: {
        label: "House",
        group: "residential"
    },
    commercial: {
        label: "Commercial",
        group: "commercial"
    },
    office: {
        label: "Office",
        group: "commercial"
    },
    shop: {
        label: "Shop",
        group: "commercial"
    },
    hotel: {
        label: "Hotel",
        group: "commercial"
    },
    restaurant: {
        label: "Restaurant",
        group: "commercial"
    },
    warehouse: {
        label: "Warehouse",
        group: "industrial"
    },
    factory: {
        label: "Factory",
        group: "industrial"
    },
    industrial: {
        label: "Industrial",
        group: "industrial"
    },
    land: {
        label: "Land",
        group: "land"
    },
    farm: {
        label: "Farm",
        group: "land"
    },
    mixed_use: {
        label: "Mixed use",
        group: "commercial"
    }
};
const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE);
function isPropertyType(value) {
    return typeof value === "string" && value in PROPERTY_TYPE;
}
const PROPERTY_TYPE_GROUPS = [
    {
        label: "Residential",
        types: [
            "apartment",
            "villa",
            "house"
        ]
    },
    {
        label: "Commercial",
        types: [
            "office",
            "shop",
            "commercial",
            "hotel",
            "restaurant",
            "mixed_use"
        ]
    },
    {
        label: "Industrial",
        types: [
            "warehouse",
            "factory",
            "industrial"
        ]
    },
    {
        label: "Land",
        types: [
            "land",
            "farm"
        ]
    }
];
const LAND_TYPES = [
    "land",
    "farm"
];
function isLandType(type) {
    return LAND_TYPES.includes(type);
}
const LISTING_KIND = {
    sale: "For sale",
    rent: "For rent",
    lease: "For lease",
    auction: "Auction"
};
function isListingKind(value) {
    return typeof value === "string" && value in LISTING_KIND;
}
const PROPERTY_STATUS = {
    draft: "Draft",
    available: "Available",
    under_offer: "Under offer",
    sold: "Sold",
    rented: "Rented",
    withdrawn: "Withdrawn"
};
const FURNISHING = {
    unfurnished: "Unfurnished",
    semi_furnished: "Semi-furnished",
    furnished: "Furnished"
};
const PLACE_KIND = {
    school: {
        label: "School",
        colour: "#3b82f6"
    },
    university: {
        label: "University",
        colour: "#3b82f6"
    },
    hospital: {
        label: "Hospital",
        colour: "#ef4444"
    },
    clinic: {
        label: "Clinic",
        colour: "#ef4444"
    },
    pharmacy: {
        label: "Pharmacy",
        colour: "#ec4899"
    },
    supermarket: {
        label: "Supermarket",
        colour: "#f59e0b"
    },
    market: {
        label: "Market",
        colour: "#f59e0b"
    },
    bank: {
        label: "Bank",
        colour: "#10b981"
    },
    restaurant: {
        label: "Restaurant",
        colour: "#f97316"
    },
    cafe: {
        label: "Café",
        colour: "#f97316"
    },
    hotel: {
        label: "Hotel",
        colour: "#8b5cf6"
    },
    park: {
        label: "Park",
        colour: "#22c55e"
    },
    gym: {
        label: "Gym",
        colour: "#06b6d4"
    },
    place_of_worship: {
        label: "Place of worship",
        colour: "#a855f7"
    },
    bus_stop: {
        label: "Bus stop",
        colour: "#64748b"
    },
    transport_hub: {
        label: "Transport",
        colour: "#64748b"
    },
    fuel: {
        label: "Fuel",
        colour: "#64748b"
    },
    police: {
        label: "Police",
        colour: "#1d4ed8"
    },
    government: {
        label: "Government",
        colour: "#1d4ed8"
    }
};
const NEARBY_GROUPS = [
    {
        label: "Schools",
        kinds: [
            "school",
            "university"
        ]
    },
    {
        label: "Healthcare",
        kinds: [
            "hospital",
            "clinic",
            "pharmacy"
        ]
    },
    {
        label: "Shopping",
        kinds: [
            "supermarket",
            "market"
        ]
    },
    {
        label: "Services",
        kinds: [
            "bank",
            "fuel",
            "police",
            "government"
        ]
    },
    {
        label: "Leisure",
        kinds: [
            "park",
            "gym",
            "restaurant",
            "cafe",
            "hotel"
        ]
    },
    {
        label: "Transport",
        kinds: [
            "bus_stop",
            "transport_hub"
        ]
    }
];
const PROPERTY_MEDIA_KIND = {
    photo: {
        label: "Photo",
        ready: true
    },
    floor_plan: {
        label: "Floor plan",
        ready: true
    },
    site_plan: {
        label: "Site plan",
        ready: true
    },
    video: {
        label: "Video",
        ready: true
    },
    panorama_360: {
        label: "360° panorama",
        ready: false
    },
    drone_video: {
        label: "Drone video",
        ready: false
    },
    street_view: {
        label: "Street view",
        ready: false
    },
    virtual_tour: {
        label: "Virtual tour",
        ready: false
    },
    ar_model: {
        label: "AR model",
        ready: false
    }
};
const AMENITIES = [
    "Parking",
    "Lift",
    "Generator",
    "Water tank",
    "Borehole",
    "Security",
    "CCTV",
    "Garden",
    "Balcony",
    "Terrace",
    "Swimming pool",
    "Gym",
    "Servant quarters",
    "Store room",
    "Air conditioning",
    "Solar water heater",
    "Fitted kitchen",
    "Fibre internet",
    "Wheelchair access",
    "Gated compound"
];
const BEDROOM_OPTIONS = [
    1,
    2,
    3,
    4,
    5
];
const PRICE_BANDS = [
    {
        label: "Any price"
    },
    {
        label: "Under 3M",
        max: 3_000_000
    },
    {
        label: "3M – 8M",
        min: 3_000_000,
        max: 8_000_000
    },
    {
        label: "8M – 15M",
        min: 8_000_000,
        max: 15_000_000
    },
    {
        label: "15M – 30M",
        min: 15_000_000,
        max: 30_000_000
    },
    {
        label: "Over 30M",
        min: 30_000_000
    }
];
const AREA_BANDS = [
    {
        label: "Any size"
    },
    {
        label: "50 m²+",
        min: 50
    },
    {
        label: "100 m²+",
        min: 100
    },
    {
        label: "200 m²+",
        min: 200
    },
    {
        label: "400 m²+",
        min: 400
    },
    {
        label: "1000 m²+",
        min: 1000
    }
];
function shortPrice(amount, currency = "ETB", period) {
    if (amount === null) return "On request";
    const suffix = period ? `/${period.slice(0, 2)}` : "";
    if (amount >= 1_000_000) {
        const millions = amount / 1_000_000;
        return `${currency} ${millions % 1 === 0 ? millions : millions.toFixed(1)}M${suffix}`;
    }
    if (amount >= 1_000) {
        return `${currency} ${Math.round(amount / 1_000)}K${suffix}`;
    }
    return `${currency} ${amount}${suffix}`;
}
}),
"[project]/supabase/migrations/src/components/property/property-panel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PropertyPanel",
    ()=>PropertyPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/image.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bath$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bath$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bath.mjs [app-ssr] (ecmascript) <export default as Bath>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bed$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bed$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bed.mjs [app-ssr] (ecmascript) <export default as Bed>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/building-2.mjs [app-ssr] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calculator$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Calculator$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/calculator.mjs [app-ssr] (ecmascript) <export default as Calculator>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$car$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Car$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/car.mjs [app-ssr] (ecmascript) <export default as Car>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/clipboard-list.mjs [app-ssr] (ecmascript) <export default as ClipboardList>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/external-link.mjs [app-ssr] (ecmascript) <export default as ExternalLink>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/layers.mjs [app-ssr] (ecmascript) <export default as Layers>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$maximize$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Maximize$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/maximize.mjs [app-ssr] (ecmascript) <export default as Maximize>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/map-pin.mjs [app-ssr] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/message-square.mjs [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$phone$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Phone$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/phone.mjs [app-ssr] (ecmascript) <export default as Phone>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$3d$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Rotate3d$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/rotate-3d.mjs [app-ssr] (ecmascript) <export default as Rotate3d>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$share$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Share2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/share-2.mjs [app-ssr] (ecmascript) <export default as Share2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/x.mjs [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$placeholders$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/placeholders.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/properties.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
function PropertyPanel({ summary, onClose }) {
    if (!summary) return null;
    // Keyed on the property, so selecting another one remounts with clean state
    // instead of an effect clearing the previous property's detail — which would
    // briefly show one property's photos under another's title.
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PanelBody, {
        summary: summary,
        onClose: onClose
    }, summary.id, false, {
        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
        lineNumber: 79,
        columnNumber: 10
    }, this);
}
function PanelBody({ summary, onClose }) {
    const [detail, setDetail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [failed, setFailed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [activeImage, setActiveImage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const id = summary.id;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const controller = new AbortController();
        (async ()=>{
            try {
                const response = await fetch(`/api/properties/${id}`, {
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data.property) throw new Error(data.error ?? "not found");
                setDetail(data);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.warn("[medosha:panel] detail failed:", error);
                    setFailed(true);
                }
            }
        })();
        return ()=>controller.abort();
    }, [
        id
    ]);
    // Escape closes, which is what a panel over a map should do.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onKey = (event)=>{
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return ()=>window.removeEventListener("keydown", onKey);
    }, [
        onClose
    ]);
    // The summary is already on screen from the marker, so the panel shows real
    // content immediately and fills in the rest — no empty skeleton.
    const property = detail?.property;
    const land = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isLandType"])(summary.property_type);
    const images = (detail?.media ?? []).filter((item)=>item.kind === "photo" || item.kind === "floor_plan");
    const gallery = summary.cover_image_url ? [
        {
            id: "cover",
            url: summary.cover_image_url,
            caption: summary.title,
            kind: "photo"
        },
        ...images
    ] : images;
    const tours = (detail?.media ?? []).filter((item)=>item.kind === "panorama_360" || item.kind === "virtual_tour");
    const videos = (detail?.media ?? []).filter((item)=>item.kind === "video" || item.kind === "drone_video");
    const context = `${summary.title}, a ${summary.area_m2 ?? ""}m² ${__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROPERTY_TYPE"][summary.property_type].label.toLowerCase()} in ${summary.neighbourhood ?? "Addis Ababa"}`;
    async function share() {
        const url = `${window.location.origin}/property/${summary.id}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: summary.title,
                    url
                });
            } else {
                await navigator.clipboard.writeText(url);
                __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toast"].success("Link copied");
            }
        } catch  {
        // A cancelled share is not an error worth reporting.
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        role: "dialog",
        "aria-label": summary.title,
        className: "flex h-full w-full flex-col overflow-hidden border-l bg-background",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative aspect-[4/3] bg-muted",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                src: gallery[activeImage]?.url || __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$placeholders$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROJECT_PLACEHOLDER"],
                                alt: summary.title,
                                fill: true,
                                sizes: "420px",
                                className: "object-cover",
                                // Blurred placeholder while the full image decodes.
                                placeholder: "empty"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                lineNumber: 172,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClose,
                                "aria-label": "Close",
                                className: "absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-colors hover:bg-background",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                    className: "size-4"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 188,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                lineNumber: 182,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur",
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LISTING_KIND"][summary.listing_kind]
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                lineNumber: 191,
                                columnNumber: 11
                            }, this),
                            tours.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$3d$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Rotate3d$3e$__["Rotate3d"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 197,
                                        columnNumber: 15
                                    }, this),
                                    "360° tour"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                lineNumber: 196,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                        lineNumber: 171,
                        columnNumber: 9
                    }, this),
                    gallery.length > 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-1.5 overflow-x-auto p-2",
                        children: gallery.slice(0, 8).map((item, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setActiveImage(index),
                                "aria-label": `Image ${index + 1}`,
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors", activeImage === index ? "border-brand" : "border-transparent"),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    src: item.url,
                                    alt: "",
                                    fill: true,
                                    sizes: "56px",
                                    className: "object-cover"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 216,
                                    columnNumber: 17
                                }, this)
                            }, item.id, false, {
                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                lineNumber: 206,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                        lineNumber: 204,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                lineNumber: 170,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1 overflow-y-auto",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-5 p-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-2xl font-semibold",
                                    children: [
                                        summary.price === null ? "Price on request" : (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatPrice"])(summary.price, summary.currency),
                                        summary.price_period && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-base font-normal text-muted-foreground",
                                            children: [
                                                " ",
                                                "/ ",
                                                summary.price_period
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 231,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 226,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                    className: "mt-1 font-medium leading-snug",
                                    children: summary.title
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 236,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-1 flex items-center gap-1.5 text-sm text-muted-foreground",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                            className: "size-3.5"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 238,
                                            columnNumber: 15
                                        }, this),
                                        summary.neighbourhood ?? __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROPERTY_TYPE"][summary.property_type].label
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 237,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 225,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dl", {
                            className: "grid grid-cols-3 gap-2",
                            children: [
                                !land && summary.bedrooms !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bed$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bed$3e$__["Bed"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 245,
                                        columnNumber: 27
                                    }, this),
                                    label: "Beds",
                                    value: String(summary.bedrooms)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 245,
                                    columnNumber: 15
                                }, this),
                                !land && summary.bathrooms !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bath$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bath$3e$__["Bath"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 248,
                                        columnNumber: 27
                                    }, this),
                                    label: "Baths",
                                    value: String(summary.bathrooms)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 248,
                                    columnNumber: 15
                                }, this),
                                summary.area_m2 !== null && Number(summary.area_m2) > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$maximize$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Maximize$3e$__["Maximize"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 252,
                                        columnNumber: 23
                                    }, this),
                                    label: "Built",
                                    value: `${Number(summary.area_m2).toLocaleString()} m²`
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 251,
                                    columnNumber: 15
                                }, this),
                                property?.plot_area_m2 != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$maximize$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Maximize$3e$__["Maximize"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 259,
                                        columnNumber: 23
                                    }, this),
                                    label: "Land",
                                    value: `${Number(property.plot_area_m2).toLocaleString()} m²`
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 258,
                                    columnNumber: 15
                                }, this),
                                property?.parking_spaces != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$car$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Car$3e$__["Car"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 265,
                                        columnNumber: 27
                                    }, this),
                                    label: "Garage",
                                    value: String(property.parking_spaces)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 265,
                                    columnNumber: 15
                                }, this),
                                property?.year_built != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Spec, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                                        className: "size-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 268,
                                        columnNumber: 27
                                    }, this),
                                    label: "Built",
                                    value: String(property.year_built)
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 268,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 243,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid grid-cols-2 gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Action, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 275,
                                        columnNumber: 21
                                    }, this),
                                    label: "Message",
                                    href: `/property/${summary.id}#enquire`
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 274,
                                    columnNumber: 13
                                }, this),
                                property?.owner?.phone ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Action, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$phone$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Phone$3e$__["Phone"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 280,
                                        columnNumber: 29
                                    }, this),
                                    label: "Call",
                                    href: `tel:${property.owner.phone}`,
                                    external: true
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 280,
                                    columnNumber: 15
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Action, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$phone$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Phone$3e$__["Phone"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 282,
                                        columnNumber: 29
                                    }, this),
                                    label: "Call",
                                    href: `/property/${summary.id}`
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 282,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: share,
                                    className: "flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors hover:border-brand",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$share$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Share2$3e$__["Share2"], {
                                            className: "size-4"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 289,
                                            columnNumber: 15
                                        }, this),
                                        "Share"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 284,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Action, {
                                    icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$external$2d$link$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ExternalLink$3e$__["ExternalLink"], {
                                        className: "size-4"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                        lineNumber: 293,
                                        columnNumber: 21
                                    }, this),
                                    label: "Full page",
                                    href: `/property/${summary.id}`
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 292,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 273,
                            columnNumber: 11
                        }, this),
                        failed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground",
                            children: "Full details could not load. The summary above is accurate, and the full page still works."
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 300,
                            columnNumber: 13
                        }, this),
                        !detail && !failed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "flex items-center gap-2 text-sm text-muted-foreground",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                    className: "size-3.5 animate-spin"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 308,
                                    columnNumber: 15
                                }, this),
                                "Loading details…"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 307,
                            columnNumber: 13
                        }, this),
                        property?.description && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "mb-1.5 text-sm font-medium",
                                    children: "Description"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 315,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
                                    children: property.description
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 316,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 314,
                            columnNumber: 13
                        }, this),
                        property && property.amenities.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "mb-2 text-sm font-medium",
                                    children: "Amenities"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 324,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "flex flex-wrap gap-1.5",
                                    children: property.amenities.map((amenity)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground",
                                            children: amenity
                                        }, amenity, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 327,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 325,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 323,
                            columnNumber: 13
                        }, this),
                        property?.furnishing && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-muted-foreground",
                            children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["FURNISHING"][property.furnishing]
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 336,
                            columnNumber: 13
                        }, this),
                        (tours.length > 0 || videos.length > 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "mb-2 text-sm font-medium",
                                    children: "Tours and video"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 346,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "space-y-1.5",
                                    children: [
                                        ...tours,
                                        ...videos
                                    ].map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            className: "flex items-center justify-between gap-2 text-sm",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "flex items-center gap-1.5 text-muted-foreground",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$3d$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Rotate3d$3e$__["Rotate3d"], {
                                                            className: "size-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                            lineNumber: 351,
                                                            columnNumber: 23
                                                        }, this),
                                                        __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROPERTY_MEDIA_KIND"][item.kind].label
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                    lineNumber: 350,
                                                    columnNumber: 21
                                                }, this),
                                                __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROPERTY_MEDIA_KIND"][item.kind].ready ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                    href: item.url,
                                                    target: "_blank",
                                                    rel: "noopener noreferrer",
                                                    className: "text-xs font-medium text-brand hover:underline",
                                                    children: "Open"
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                    lineNumber: 355,
                                                    columnNumber: 23
                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs text-muted-foreground",
                                                    children: "Viewer coming"
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                    lineNumber: 364,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, item.id, true, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 349,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 347,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 345,
                            columnNumber: 13
                        }, this),
                        detail && detail.nearby.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "mb-2 text-sm font-medium",
                                    children: "What’s nearby"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 374,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NEARBY_GROUPS"].map((group)=>{
                                        const matches = detail.nearby.filter((place)=>group.kinds.includes(place.kind));
                                        if (matches.length === 0) return null;
                                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-muted-foreground",
                                                    children: group.label
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                    lineNumber: 384,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                                    className: "mt-1 space-y-1",
                                                    children: matches.slice(0, 3).map((place)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                                            className: "flex items-center justify-between gap-2 text-sm",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "flex min-w-0 items-center gap-1.5",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            "aria-hidden": true,
                                                                            className: "size-2 shrink-0 rounded-full",
                                                                            style: {
                                                                                backgroundColor: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PLACE_KIND"][place.kind].colour
                                                                            }
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                                            lineNumber: 389,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: "truncate",
                                                                            children: place.name
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                                            lineNumber: 394,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                                    lineNumber: 388,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "shrink-0 text-xs text-muted-foreground tabular-nums",
                                                                    children: place.distance_km < 1 ? `${Math.round(place.distance_km * 1000)} m` : `${place.distance_km} km`
                                                                }, void 0, false, {
                                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                                    lineNumber: 396,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, place.id, true, {
                                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                            lineNumber: 387,
                                                            columnNumber: 27
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                    lineNumber: 385,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, group.label, true, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 383,
                                            columnNumber: 21
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 375,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 373,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                    className: "mb-2 text-sm font-medium",
                                    children: "Plan work on this property"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 413,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid grid-cols-2 gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                                            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calculator$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Calculator$3e$__["Calculator"], {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                lineNumber: 415,
                                                columnNumber: 27
                                            }, this),
                                            label: "Cost estimate",
                                            href: `/ai?agent=cost&q=${encodeURIComponent(`Estimate renovation cost for ${context}`)}`
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 415,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                                            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clipboard$2d$list$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClipboardList$3e$__["ClipboardList"], {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                lineNumber: 416,
                                                columnNumber: 27
                                            }, this),
                                            label: "BOQ",
                                            href: `/ai?agent=boq&q=${encodeURIComponent(`Generate a BOQ for ${context}`)}`
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 416,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                                            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__["Layers"], {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                lineNumber: 417,
                                                columnNumber: 27
                                            }, this),
                                            label: "Materials",
                                            href: `/ai?agent=materials&q=${encodeURIComponent(`Recommend materials for ${context}`)}`
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 417,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                                            icon: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                                                className: "size-3.5"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                                lineNumber: 418,
                                                columnNumber: 27
                                            }, this),
                                            label: "Suppliers",
                                            href: "/companies"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 418,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 414,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-2 flex flex-wrap gap-1.5 text-xs",
                                    children: [
                                        {
                                            href: "/directory/individual",
                                            label: "Professionals"
                                        },
                                        {
                                            href: "/marketplace",
                                            label: "Marketplace"
                                        },
                                        {
                                            href: "/price-exchange",
                                            label: "Prices"
                                        },
                                        {
                                            href: "/services",
                                            label: "Services"
                                        }
                                    ].map((link)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                            href: link.href,
                                            className: "rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-brand hover:text-foreground",
                                            children: link.label
                                        }, link.href, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 427,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 420,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 412,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: `/ai?q=${encodeURIComponent(`Is the price fair for ${context}?`)}`,
                            className: "flex items-center gap-2.5 rounded-xl border border-dashed p-3 transition-colors hover:border-brand hover:bg-brand/5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                    className: "size-4 shrink-0 text-brand"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 442,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "block font-medium",
                                            children: "Ask the AI assistant"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 444,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "block text-xs text-muted-foreground",
                                            children: "Is this a fair price? What would it cost to renovate?"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                            lineNumber: 445,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                                    lineNumber: 443,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                            lineNumber: 438,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                    lineNumber: 224,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                lineNumber: 223,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
        lineNumber: 165,
        columnNumber: 5
    }, this);
}
function Spec({ icon, label, value }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-lg border p-2 text-center",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dt", {
                className: "flex items-center justify-center gap-1 text-xs text-muted-foreground",
                children: [
                    icon,
                    label
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                lineNumber: 459,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("dd", {
                className: "mt-0.5 text-sm font-medium",
                children: value
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                lineNumber: 463,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
        lineNumber: 458,
        columnNumber: 5
    }, this);
}
function Action({ icon, label, href, external }) {
    const className = "flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors hover:border-brand";
    if (external) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
            href: href,
            className: className,
            children: [
                icon,
                label
            ]
        }, void 0, true, {
            fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
            lineNumber: 484,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: href,
        className: className,
        children: [
            icon,
            label
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
        lineNumber: 491,
        columnNumber: 5
    }, this);
}
function Tool({ icon, label, href }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: href,
        className: "flex items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors hover:border-brand hover:bg-brand/5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-brand",
                children: icon
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
                lineNumber: 504,
                columnNumber: 7
            }, this),
            label
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/property/property-panel.tsx",
        lineNumber: 500,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/map/markers.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MAP_LAYERS",
    ()=>MAP_LAYERS,
    "MARKER_COLOURS",
    ()=>MARKER_COLOURS,
    "categoryFor",
    ()=>categoryFor,
    "clusterProperties",
    ()=>clusterProperties,
    "createClusterElement",
    ()=>createClusterElement,
    "createMarkerElement",
    ()=>createMarkerElement,
    "listingKindLabel",
    ()=>listingKindLabel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/properties.ts [app-ssr] (ecmascript)");
;
const MARKER_COLOURS = {
    sale: {
        label: "For sale",
        base: "#16a34a",
        dark: "#15803d"
    },
    rent: {
        label: "For rent",
        base: "#2563eb",
        dark: "#1d4ed8"
    },
    project: {
        label: "New project",
        base: "#ea580c",
        dark: "#c2410c"
    },
    commercial: {
        label: "Commercial",
        base: "#9333ea",
        dark: "#7e22ce"
    },
    featured: {
        label: "Featured",
        base: "#d4a017",
        dark: "#b8860b"
    }
};
const COMMERCIAL_TYPES = [
    "commercial",
    "office",
    "shop",
    "hotel",
    "restaurant",
    "warehouse",
    "factory",
    "industrial",
    "mixed_use"
];
function categoryFor(property) {
    if (property.featured) return "featured";
    if (COMMERCIAL_TYPES.includes(property.property_type)) return "commercial";
    if (property.listing_kind === "rent" || property.listing_kind === "lease") {
        return "rent";
    }
    return "sale";
}
function createMarkerElement(property, onSelect) {
    const category = categoryFor(property);
    const colours = MARKER_COLOURS[category];
    const wrapper = document.createElement("div");
    wrapper.className = "medosha-marker";
    wrapper.dataset.category = category;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "medosha-marker__body";
    button.style.setProperty("--marker", colours.base);
    button.style.setProperty("--marker-dark", colours.dark);
    button.textContent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shortPrice"])(property.price, property.currency, property.price_period);
    button.setAttribute("aria-label", `${property.title} — ${colours.label}${property.price ? `, ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["shortPrice"])(property.price, property.currency)}` : ""}`);
    button.addEventListener("click", (event)=>{
        event.stopPropagation();
        onSelect(property);
    });
    const stem = document.createElement("span");
    stem.className = "medosha-marker__stem";
    stem.setAttribute("aria-hidden", "true");
    wrapper.append(button, stem);
    return wrapper;
}
function createClusterElement(count, onClick) {
    const wrapper = document.createElement("div");
    wrapper.className = "medosha-cluster";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "medosha-cluster__body";
    const size = Math.min(58, 34 + Math.log10(Math.max(count, 1)) * 16);
    button.style.width = `${size}px`;
    button.style.height = `${size}px`;
    button.textContent = count > 999 ? "999+" : String(count);
    button.setAttribute("aria-label", `${count} properties here — zoom in`);
    button.addEventListener("click", (event)=>{
        event.stopPropagation();
        onClick();
    });
    wrapper.append(button);
    return wrapper;
}
function clusterProperties(properties, zoom) {
    // Past this zoom the pins are far enough apart to stand alone.
    if (zoom >= 14 || properties.length <= 8) {
        return {
            clusters: [],
            singles: properties
        };
    }
    // Cell size shrinks as zoom grows, so clusters break apart naturally.
    const cell = 0.75 / Math.pow(2, zoom - 8);
    const grid = new Map();
    for (const property of properties){
        const key = `${Math.floor(property.latitude / cell)}:${Math.floor(property.longitude / cell)}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(property);
        else grid.set(key, [
            property
        ]);
    }
    const clusters = [];
    const singles = [];
    for (const [key, bucket] of grid){
        if (bucket.length === 1) {
            if (bucket[0]) singles.push(bucket[0]);
            continue;
        }
        // The centroid, so the bubble sits among its properties rather than on
        // the corner of an invisible grid cell.
        const longitude = bucket.reduce((sum, item)=>sum + item.longitude, 0) / bucket.length;
        const latitude = bucket.reduce((sum, item)=>sum + item.latitude, 0) / bucket.length;
        clusters.push({
            id: key,
            longitude,
            latitude,
            properties: bucket
        });
    }
    return {
        clusters,
        singles
    };
}
const MAP_LAYERS = [
    {
        id: "properties",
        label: "Properties",
        colour: "#16a34a",
        ready: true
    },
    {
        id: "schools",
        label: "Schools",
        colour: "#3b82f6",
        ready: true
    },
    {
        id: "hospitals",
        label: "Hospitals",
        colour: "#ef4444",
        ready: true
    },
    {
        id: "projects",
        label: "Construction projects",
        colour: "#ea580c",
        ready: false
    },
    {
        id: "companies",
        label: "Companies",
        colour: "#9333ea",
        ready: false
    },
    {
        id: "professionals",
        label: "Professionals",
        colour: "#0891b2",
        ready: false
    },
    {
        id: "suppliers",
        label: "Material suppliers",
        colour: "#d4a017",
        ready: false
    },
    {
        id: "roads",
        label: "Roads",
        colour: "#64748b",
        ready: false
    }
];
function listingKindLabel(kind) {
    return kind === "rent" || kind === "lease" ? "For rent" : "For sale";
}
}),
"[project]/supabase/migrations/src/lib/constants/invest.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEMO_BADGE",
    ()=>DEMO_BADGE,
    "DEMO_NOTICE",
    ()=>DEMO_NOTICE,
    "DEMO_NOTICE_SHORT",
    ()=>DEMO_NOTICE_SHORT,
    "DEMO_SUBTITLE",
    ()=>DEMO_SUBTITLE,
    "INVEST_DOC_KIND",
    ()=>INVEST_DOC_KIND,
    "INVEST_MEDIA_KIND",
    ()=>INVEST_MEDIA_KIND,
    "INVEST_RISK",
    ()=>INVEST_RISK,
    "INVEST_SORTS",
    ()=>INVEST_SORTS,
    "INVEST_STAGE",
    ()=>INVEST_STAGE,
    "INVEST_STAGES",
    ()=>INVEST_STAGES,
    "compactBirr",
    ()=>compactBirr,
    "fundingPct",
    ()=>fundingPct,
    "isInvestSort",
    ()=>isInvestSort,
    "isInvestStage",
    ()=>isInvestStage
]);
const DEMO_BADGE = "DEMO PROJECT";
const DEMO_SUBTITLE = "Illustrative example · Sample data";
const DEMO_NOTICE = "This is a demonstration project built to show how Medosha Invest works. It is not a real investment opportunity, the figures are illustrative, and nothing here is an offer or a solicitation. No money can be committed through this page.";
const DEMO_NOTICE_SHORT = "Sample data. Not a real investment opportunity.";
const INVEST_RISK = {
    low: {
        label: "Lower risk",
        blurb: "Permits in hand, construction well advanced.",
        dot: "bg-emerald-500",
        chip: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
    },
    moderate: {
        label: "Moderate risk",
        blurb: "Funding or construction still in progress.",
        dot: "bg-amber-500",
        chip: "border-amber-500/40 text-amber-600 dark:text-amber-400"
    },
    high: {
        label: "Higher risk",
        blurb: "Large scale, long horizon, or early stage.",
        dot: "bg-rose-500",
        chip: "border-rose-500/40 text-rose-600 dark:text-rose-400"
    }
};
const INVEST_STAGE = {
    raising: {
        label: "Raising",
        blurb: "Open to interest"
    },
    funded: {
        label: "Funded",
        blurb: "Target reached"
    },
    building: {
        label: "Building",
        blurb: "Under construction"
    },
    completed: {
        label: "Completed",
        blurb: "Handed over"
    }
};
const INVEST_STAGES = Object.keys(INVEST_STAGE);
function isInvestStage(value) {
    return typeof value === "string" && value in INVEST_STAGE;
}
const INVEST_DOC_KIND = {
    prospectus: "Prospectus",
    feasibility: "Feasibility study",
    permit: "Building permit",
    title: "Land title",
    financials: "Financial projections",
    progress_report: "Progress report",
    valuation: "Valuation"
};
const INVEST_MEDIA_KIND = {
    photo: {
        label: "Photo",
        ready: true
    },
    render: {
        label: "Render",
        ready: true
    },
    drone: {
        label: "Drone photo",
        ready: true
    },
    video: {
        label: "Video",
        ready: true
    },
    floor_plan: {
        label: "Floor plan",
        ready: true
    },
    model_3d: {
        label: "3D model",
        ready: false
    }
};
const INVEST_SORTS = [
    {
        value: "funding",
        label: "Largest first"
    },
    {
        value: "roi",
        label: "Highest expected ROI"
    },
    {
        value: "progress",
        label: "Closest to funded"
    },
    {
        value: "newest",
        label: "Newest"
    }
];
function isInvestSort(value) {
    return INVEST_SORTS.some((sort)=>sort.value === value);
}
function compactBirr(amount, currency = "ETB") {
    if (amount >= 1_000_000_000) {
        return `${currency} ${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
    }
    if (amount >= 1_000_000) {
        return `${currency} ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
    }
    if (amount >= 1_000) {
        return `${currency} ${(amount / 1_000).toFixed(0)}K`;
    }
    return `${currency} ${amount.toLocaleString()}`;
}
function fundingPct(raised, goal) {
    if (goal <= 0) return 0;
    return Math.min(100, Math.round(raised / goal * 1000) / 10);
}
}),
"[project]/supabase/migrations/src/lib/constants/price-exchange.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_SECTOR",
    ()=>DEFAULT_SECTOR,
    "PRICE_SECTORS",
    ()=>PRICE_SECTORS,
    "PRICE_SORTS",
    ()=>PRICE_SORTS,
    "TREND_RANGES",
    ()=>TREND_RANGES,
    "isPriceSector",
    ()=>isPriceSector,
    "isPriceSort",
    ()=>isPriceSort,
    "sectorLabel",
    ()=>sectorLabel
]);
const PRICE_SECTORS = [
    {
        value: "material",
        label: "Materials",
        blurb: "Cement, rebar, blocks, finishes"
    },
    {
        value: "labor",
        label: "Labor",
        blurb: "Daily and contract rates by trade"
    },
    {
        value: "furniture",
        label: "Furniture",
        blurb: "Fittings, joinery, fixtures"
    },
    {
        value: "project",
        label: "Projects",
        blurb: "Rates per m² by building type"
    }
];
const DEFAULT_SECTOR = "material";
function isPriceSector(value) {
    return PRICE_SECTORS.some((sector)=>sector.value === value);
}
function sectorLabel(sector) {
    return PRICE_SECTORS.find((s)=>s.value === sector)?.label ?? "Prices";
}
const PRICE_SORTS = {
    lowest: "Lowest price",
    highest: "Highest price",
    rating: "Best rated",
    newest: "Recently updated",
    popular: "Most viewed"
};
function isPriceSort(value) {
    return typeof value === "string" && value in PRICE_SORTS;
}
const TREND_RANGES = [
    {
        days: 30,
        label: "30 days"
    },
    {
        days: 90,
        label: "90 days"
    },
    {
        days: 365,
        label: "1 year"
    }
];
}),
"[project]/supabase/migrations/src/lib/workspace/selection.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "clearSelection",
    ()=>clearSelection,
    "select",
    ()=>select,
    "useSelection",
    ()=>useSelection
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
let selection = null;
const listeners = new Set();
function emit() {
    for (const listener of listeners)listener();
}
function subscribe(listener) {
    listeners.add(listener);
    return ()=>{
        listeners.delete(listener);
    };
}
function getSnapshot() {
    return selection;
}
function getServerSnapshot() {
    return null;
}
function select(next) {
    // Reference equality is enough: callers pass a fresh object per selection,
    // and re-selecting the same id should still be a no-op.
    if (selection?.kind === next?.kind && selection?.id === next?.id) return;
    selection = next;
    emit();
}
function clearSelection() {
    if (selection === null) return;
    selection = null;
    emit();
}
function useSelection() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribe, getSnapshot, getServerSnapshot);
}
}),
"[project]/supabase/migrations/src/components/shell/context-panel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ContextPanel",
    ()=>ContextPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-ssr] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/info.mjs [app-ssr] (ecmascript) <export default as Info>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$close$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightClose$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/panel-right-close.mjs [app-ssr] (ecmascript) <export default as PanelRightClose>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/star.mjs [app-ssr] (ecmascript) <export default as Star>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/x.mjs [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$ai$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ai/ai-chat.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$property$2f$property$2d$panel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/property/property-panel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$map$2f$markers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/map/markers.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$invest$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/invest.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$price$2d$exchange$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/price-exchange.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/properties.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$selection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/selection.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
function ContextPanel({ signedIn, homeWidget }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const { aiOpen } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    const [chosen, setChosen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("context");
    // Derived, not synchronised. Opening the dock from anywhere — the launcher,
    // the palette, the + menu — flips one flag in the store and the panel simply
    // reads it, so there is no effect mirroring one piece of state into another.
    const tab = aiOpen ? "ai" : chosen;
    function show(next) {
        setChosen(next);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
            aiOpen: next === "ai"
        });
    }
    const item = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["matchNavItem"])(pathname, searchParams), [
        pathname,
        searchParams
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        "aria-label": "Context",
        className: "flex h-full w-full flex-col overflow-hidden bg-background",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex h-14 shrink-0 items-center gap-1 border-b px-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TabButton, {
                        active: tab === "context",
                        onClick: ()=>show("context"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Info$3e$__["Info"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 81,
                                columnNumber: 11
                            }, this),
                            "Context"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TabButton, {
                        active: tab === "ai",
                        onClick: ()=>show("ai"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 85,
                                columnNumber: 11
                            }, this),
                            "AI"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 84,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["closePanel"],
                        "aria-label": "Collapse context panel",
                        title: "Collapse panel",
                        className: "ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$close$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightClose$3e$__["PanelRightClose"], {
                            className: "size-4"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 96,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 89,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 79,
                columnNumber: 7
            }, this),
            tab === "ai" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1 overflow-hidden",
                children: signedIn ? // Keyed on the route so the assistant starts a fresh thread when
                // the workspace moves — a question about a property should not
                // arrive with a marketplace conversation above it.
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$ai$2d$chat$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AiChat"], {
                    compact: true
                }, pathname, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 106,
                    columnNumber: 13
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SignedOutAi, {}, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 108,
                    columnNumber: 13
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 101,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1 overflow-y-auto",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(ContextBody, {
                    pathname: pathname,
                    searchParams: searchParams,
                    homeWidget: homeWidget
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 113,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 112,
                columnNumber: 9
            }, this),
            tab === "context" && item && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0 border-t p-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    type: "button",
                    onClick: ()=>show("ai"),
                    className: "flex w-full items-center gap-2.5 rounded-xl border border-dashed p-2.5 text-left transition-colors hover:border-brand hover:bg-brand/5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                            className: "size-4 shrink-0 text-brand"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 128,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "min-w-0 text-sm",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "block font-medium",
                                    children: [
                                        "Ask about ",
                                        item.label
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                    lineNumber: 130,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "block truncate text-xs text-muted-foreground",
                                    children: "Without leaving this page"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                    lineNumber: 131,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 129,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 123,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 122,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 75,
        columnNumber: 5
    }, this);
}
function TabButton({ active, onClick, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: onClick,
        "aria-pressed": active,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"),
        children: children
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 152,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
// Route dispatch
// ---------------------------------------------------------------------------
function ContextBody({ pathname, searchParams, homeWidget }) {
    // The homepage's right sidebar. The panel arrives already rendered on the
    // server, so this only decides where it goes.
    //
    // No `BrowseContext` beneath it: that is a list of the same sections the
    // left rail and the phone's bottom bar already carry, and repeating it here
    // was the reason this column read as filler. What belongs beside a feed is
    // what the platform currently holds — prices, products, projects, firms,
    // people — not a third copy of the navigation.
    if (pathname === "/" && homeWidget) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "p-3",
            children: homeWidget
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
            lineNumber: 190,
            columnNumber: 12
        }, this);
    }
    if (pathname.startsWith("/invest")) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(InvestContext, {}, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
            lineNumber: 193,
            columnNumber: 12
        }, this);
    }
    if (pathname.startsWith("/city")) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(CityContext, {}, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
            lineNumber: 196,
            columnNumber: 12
        }, this);
    }
    if (pathname.startsWith("/price-exchange")) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PriceContext, {
            searchParams: searchParams
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
            lineNumber: 199,
            columnNumber: 12
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(BrowseContext, {
        pathname: pathname,
        searchParams: searchParams
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 201,
        columnNumber: 10
    }, this);
}
/**
 * On the map, the panel *is* the property panel.
 *
 * The map publishes its selection to the workspace store and this reads it, so
 * there is one right-hand column rather than the shell's panel and the map's
 * panel fighting for the same 400px.
 */ function CityContext() {
    const selection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$selection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSelection"])();
    if (selection?.kind === "property" && selection.property) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$property$2f$property$2d$panel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PropertyPanel"], {
            summary: selection.property,
            onClose: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$selection$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearSelection"])()
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
            lineNumber: 216,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Medosha City",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-muted-foreground",
                    children: "Select a marker to see the property, its photos, any 360° tour and what is nearby. The map keeps running underneath — nothing here navigates away from it."
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 226,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 225,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Marker key",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "space-y-1.5",
                    children: Object.entries(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$map$2f$markers$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MARKER_COLOURS"]).map(([key, colour])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            className: "flex items-center gap-2 text-sm",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    "aria-hidden": true,
                                    className: "size-3 shrink-0 rounded-full",
                                    style: {
                                        backgroundColor: colour.base
                                    }
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                    lineNumber: 237,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-muted-foreground",
                                    children: colour.label
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                    lineNumber: 242,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, key, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 236,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 234,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 233,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Jump to",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-1.5",
                        children: Object.entries(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LISTING_KIND"]).map(([kind, label])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                                href: `/city?kind=${kind}`,
                                children: label
                            }, kind, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 251,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 249,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 flex flex-wrap gap-1.5",
                        children: [
                            "villa",
                            "apartment",
                            "office",
                            "land"
                        ].map((type)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                                href: `/city?type=${type}`,
                                children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$properties$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PROPERTY_TYPE"][type].label
                            }, type, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 258,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 256,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 248,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 224,
        columnNumber: 5
    }, this);
}
/**
 * Beside a development: what the module is, and the parts of Medosha that
 * price, build and staff the thing you are looking at.
 */ function InvestContext() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Medosha Invest",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-muted-foreground",
                        children: "Development projects with their funding, construction progress and reporting in one place."
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 276,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-muted-foreground",
                        children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$invest$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DEMO_NOTICE_SHORT"]
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 280,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 275,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Behind a development",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/ai?agent=cost",
                            label: "Estimate the build cost"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 287,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/ai?agent=boq",
                            label: "Generate a BOQ"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 288,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/price-exchange",
                            label: "Material prices"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 289,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/companies",
                            label: "Developers and contractors"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 290,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/directory/individual",
                            label: "Architects and engineers"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 291,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/city",
                            label: "See the area on the map"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 292,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 286,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 285,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Browse",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-wrap gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                            href: "/invest",
                            children: "All projects"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 298,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                            href: "/invest?sort=roi",
                            children: "Highest ROI"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 299,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                            href: "/invest?sort=progress",
                            children: "Closest to funded"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 300,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Chip, {
                            href: "/invest/investors",
                            children: "Investors"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 301,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 297,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 296,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 274,
        columnNumber: 5
    }, this);
}
function PriceContext({ searchParams }) {
    const sector = searchParams?.get("sector") ?? "material";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Markets",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "space-y-1",
                    children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$price$2d$exchange$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PRICE_SECTORS"].map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: `/price-exchange?sector=${entry.value}`,
                                "aria-current": entry.value === sector ? "page" : undefined,
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors", entry.value === sector ? "bg-brand/12 font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"),
                                children: [
                                    entry.label,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                        className: "size-3.5 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 328,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 317,
                                columnNumber: 15
                            }, this)
                        }, entry.value, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 316,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 314,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 313,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Reading the table",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-muted-foreground",
                    children: "Prices come from suppliers and are updated live — a new listing or bid appears without a reload. The chart on each listing shows how the rate has moved, and the lowest bid is the best offer currently standing."
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 336,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 335,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Use these prices",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid gap-1.5",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/ai?agent=cost",
                            label: "Estimate a build with them"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 345,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/ai?agent=boq",
                            label: "Price a bill of quantities"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 346,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/ai?agent=materials",
                            label: "Compare material options"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 347,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Tool, {
                            href: "/companies",
                            label: "Find the suppliers behind them"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 348,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 344,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 343,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 312,
        columnNumber: 5
    }, this);
}
/**
 * The default panel: what you are filtering, where else to look, and the
 * workspace you have pinned. Everything is read out of the URL, so it is
 * always describing the results actually on screen.
 */ function BrowseContext({ pathname, searchParams }) {
    const item = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["matchNavItem"])(pathname, searchParams);
    const { pins } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    // Query keys that are page mechanics rather than filters the user chose.
    const IGNORED = new Set([
        "page",
        "redirect"
    ]);
    const filters = [
        ...searchParams?.entries() ?? []
    ].filter(([key, value])=>!IGNORED.has(key) && value !== "");
    // Narrowed rather than asserted: the filter proves `href` is a string, so
    // the links below need no non-null assertion to read it.
    const siblings = item?.section.items.filter((sibling)=>typeof sibling.href === "string" && sibling.href.length > 0 && sibling.id !== item.id) ?? [];
    const pinned = pins.map((id)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["findItem"])(id)).filter((entry)=>typeof entry?.href === "string" && entry.href.length > 0);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-5 p-4",
        children: [
            item ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: item.label,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-muted-foreground",
                    children: item.hint ?? `Part of ${item.section.label}.`
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 397,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 396,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Workspace",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-muted-foreground",
                    children: [
                        "Press",
                        " ",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                            className: "rounded border px-1 text-xs",
                            children: "⌘"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 405,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("kbd", {
                            className: "rounded border px-1 text-xs",
                            children: "K"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 406,
                            columnNumber: 13
                        }, this),
                        " to jump anywhere, or use the + button to create something."
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 403,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 402,
                columnNumber: 9
            }, this),
            filters.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Active filters",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "flex flex-wrap gap-1.5",
                        children: filters.map(([key, value])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-muted-foreground",
                                        children: key
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 420,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "font-medium",
                                        children: value
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 421,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                        href: withoutParam(pathname, searchParams, key),
                                        "aria-label": `Clear ${key} filter`,
                                        className: "text-muted-foreground transition-colors hover:text-foreground",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                            className: "size-3"
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                            lineNumber: 427,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 422,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, `${key}=${value}`, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 416,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 414,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: pathname,
                        className: "mt-2 inline-block text-xs text-brand hover:underline",
                        children: "Clear all"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                        lineNumber: 432,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 413,
                columnNumber: 9
            }, this),
            item && siblings.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: `More in ${item.section.label}`,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "space-y-0.5",
                    children: siblings.slice(0, 7).map((sibling)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: sibling.href,
                                className: "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(sibling.icon, {
                                        className: "size-3.5 shrink-0"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 450,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "truncate",
                                        children: sibling.label
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 451,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 446,
                                columnNumber: 17
                            }, this)
                        }, sibling.id, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 445,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 443,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 442,
                columnNumber: 9
            }, this),
            pinned.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "My Workspace",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "space-y-0.5",
                    children: pinned.map((entry)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: entry.href,
                                className: "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__["Star"], {
                                        className: "size-3 shrink-0 text-brand"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 468,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "truncate",
                                        children: entry.label
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 469,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 464,
                                columnNumber: 17
                            }, this)
                        }, entry.id, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 463,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 461,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 460,
                columnNumber: 9
            }, this),
            !item && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                title: "Sections",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "space-y-0.5",
                    children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].filter((section)=>section.items.length > 0).map((section)=>{
                        const first = section.items.find((entry)=>typeof entry.href === "string" && entry.href.length > 0);
                        if (!first) return null;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: first.href,
                                className: "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        "aria-hidden": true,
                                        children: section.emoji
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 493,
                                        columnNumber: 23
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "truncate",
                                        children: section.label
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                        lineNumber: 494,
                                        columnNumber: 23
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                                lineNumber: 489,
                                columnNumber: 21
                            }, this)
                        }, section.id, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                            lineNumber: 488,
                            columnNumber: 19
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 479,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 478,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 394,
        columnNumber: 5
    }, this);
}
function SignedOutAi() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "flex size-11 items-center justify-center rounded-full bg-brand/12 text-brand",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                    className: "size-5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                    lineNumber: 511,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 510,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm font-medium",
                children: "Sign in to use Medosha AI"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 513,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-muted-foreground",
                children: "The assistant answers with real prices, suppliers and professionals from the platform, so it needs to know who is asking."
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 514,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                href: "/login?redirect=/ai",
                className: "rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90",
                children: "Sign in"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 518,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 509,
        columnNumber: 5
    }, this);
}
function Section({ title, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
                children: title
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 537,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 536,
        columnNumber: 5
    }, this);
}
function Chip({ href, children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: href,
        className: "rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground",
        children: children
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 547,
        columnNumber: 5
    }, this);
}
function Tool({ href, label }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: href,
        className: "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors hover:border-brand hover:bg-brand/5",
        children: [
            label,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                className: "size-3.5 shrink-0 text-muted-foreground"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
                lineNumber: 563,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/context-panel.tsx",
        lineNumber: 558,
        columnNumber: 5
    }, this);
}
/** The current URL with one query key removed, for the filter chips' ✕. */ function withoutParam(pathname, searchParams, key) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete(key);
    next.delete("page");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
}
}),
"[project]/supabase/migrations/src/components/shell/menu-bar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MenuBar",
    ()=>MenuBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/armchair.mjs [app-ssr] (ecmascript) <export default as Armchair>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs [app-ssr] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
/**
 * The menu bar.
 *
 * A fifth surface reading `NAV_SECTIONS` — the sidebar, the breadcrumb, the
 * command palette and the tab bar are the others. None of them keeps its own
 * list, which is the only reason five surfaces can agree about what this
 * platform contains.
 *
 * Hover opens it, and hover alone would make it unusable, so:
 *
 *   - a click opens and closes it too, because a phone has no hover and a
 *     tablet's is a lie;
 *   - keyboard focus opens it, Escape closes it, and the arrow keys walk it,
 *     because a menu you can only reach with a mouse is a menu some people
 *     cannot reach at all;
 *   - closing is delayed by a moment, because the pointer has to cross a gap
 *     between the label and the panel, and a menu that vanishes in that gap is
 *     a menu nobody can hit.
 *
 * Once one menu is open, moving across the bar switches to its neighbour
 * immediately rather than waiting for another hover — which is how every
 * menu bar has behaved since 1984 and what makes a bar feel like a bar rather
 * than nine unrelated buttons.
 */ /** How long the pointer may be outside both label and panel before it closes. */ const CLOSE_DELAY = 180;
function MenuBar({ signedIn }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const closeTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const bar = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const cancelClose = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);
    const scheduleClose = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        cancelClose();
        closeTimer.current = window.setTimeout(()=>setOpen(null), CLOSE_DELAY);
    }, [
        cancelClose
    ]);
    // A pending timer outlives the component if the route changes mid-hover.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>cancelClose, [
        cancelClose
    ]);
    // Navigating closes it. Adjusted during render rather than in an effect:
    // React supports resetting state when a prop changes this way, and an effect
    // would render the open panel once over the page it just took you to before
    // closing it. A link click closes it directly; this covers the back button.
    const [lastPath, setLastPath] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(pathname);
    if (lastPath !== pathname) {
        setLastPath(pathname);
        setOpen(null);
    }
    // A click anywhere else closes it, including on the page underneath.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (open === null) return;
        const onPointerDown = (event)=>{
            if (!bar.current?.contains(event.target)) setOpen(null);
        };
        const onKeyDown = (event)=>{
            if (event.key === "Escape") setOpen(null);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return ()=>{
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [
        open
    ]);
    /** Left or right along the bar, wrapping. */ const step = (from, direction)=>{
        const index = __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].findIndex((section)=>section.id === from);
        const next = __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"][(index + direction + __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].length) % __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].length];
        if (next) setOpen(next.id);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: bar,
        // Below lg the sidebar is a drawer and the bottom bar carries navigation,
        // so a second menu would be a third way to reach the same nine sections.
        // Hidden on paper for the obvious reason.
        // Scrolls when nine sections plus Berchuma do not fit — at 952 px of
        // workspace, which is what a 1600 px screen leaves with both panels open,
        // they do not. The dropdowns are positioned against the viewport rather
        // than against this element precisely because it scrolls: an absolutely
        // positioned panel inside a container with `overflow-x: auto` is clipped
        // vertically too, which is a CSS rule people rediscover once each.
        className: "relative hidden h-10 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b px-2 [scrollbar-width:none] lg:flex print:hidden [&::-webkit-scrollbar]:hidden",
        onMouseLeave: scheduleClose,
        onMouseEnter: cancelClose,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
            "aria-label": "Main menu",
            className: "flex items-center gap-0.5",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/studio",
                    "aria-current": isActive(pathname, "/studio") ? "page" : undefined,
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap", isActive(pathname, "/studio") ? "bg-brand text-brand-foreground" : "text-brand hover:bg-brand/10"),
                    onMouseEnter: ()=>setOpen(null),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$armchair$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Armchair$3e$__["Armchair"], {
                            className: "size-3.5",
                            "aria-hidden": true
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                            lineNumber: 132,
                            columnNumber: 11
                        }, this),
                        "Berchuma Studio"
                    ]
                }, void 0, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                    lineNumber: 121,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "mr-1 h-4 w-px shrink-0 bg-border",
                    "aria-hidden": true
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                    lineNumber: 136,
                    columnNumber: 9
                }, this),
                __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].map((section)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Section, {
                        section: section,
                        open: open === section.id,
                        anyOpen: open !== null,
                        signedIn: signedIn,
                        pathname: pathname,
                        onOpen: ()=>{
                            cancelClose();
                            setOpen(section.id);
                        },
                        onToggle: (pointer)=>setOpen((current)=>{
                                // A mouse has already opened this by hovering, so a click that
                                // toggled would close the menu the user just reached for. On
                                // touch there is no hover and a tap has to do both jobs.
                                if (pointer === "mouse") return section.id;
                                return current === section.id ? null : section.id;
                            }),
                        onLeave: scheduleClose,
                        onStep: (direction)=>step(section.id, direction),
                        onClose: ()=>setOpen(null)
                    }, section.id, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                        lineNumber: 139,
                        columnNumber: 11
                    }, this))
            ]
        }, void 0, true, {
            fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
            lineNumber: 116,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
        lineNumber: 98,
        columnNumber: 5
    }, this);
}
// ---------------------------------------------------------------------------
function Section({ section, open, anyOpen, signedIn, pathname, onOpen, onToggle, onLeave, onStep, onClose }) {
    const active = section.items.some((item)=>item.href && isActive(pathname, item.href)) || section.href === "/" && pathname === "/" || section.href !== undefined && section.href !== "/" && isActive(pathname, section.href);
    // A section with no children is a destination, not a menu. Home is the one
    // that matters, and a dropdown containing nothing would be a trap.
    //
    // The two shapes are two components rather than one with a branch, because
    // the menu needs hooks and a component may not call them after an early
    // return.
    if (section.items.length === 0 && section.href) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
            href: section.href,
            "aria-current": active ? "page" : undefined,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap", active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"),
            onMouseEnter: onClose,
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    "aria-hidden": true,
                    children: section.emoji
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                    lineNumber: 216,
                    columnNumber: 9
                }, this),
                section.label
            ]
        }, void 0, true, {
            fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
            lineNumber: 207,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SectionMenu, {
        section: section,
        open: open,
        anyOpen: anyOpen,
        signedIn: signedIn,
        pathname: pathname,
        active: active,
        onOpen: onOpen,
        onToggle: onToggle,
        onLeave: onLeave,
        onStep: onStep,
        onClose: onClose
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
        lineNumber: 223,
        columnNumber: 5
    }, this);
}
function SectionMenu({ section, open, anyOpen, signedIn, pathname, active, onOpen, onToggle, onLeave, onStep, onClose }) {
    const trigger = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Measured when the menu opens, not during render: reading a DOM rectangle
    // while rendering is reading something React has not finished writing.
    const [anchor, setAnchor] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        left: 0,
        top: 0
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!open) return;
        const place = ()=>{
            const rect = trigger.current?.getBoundingClientRect();
            if (!rect) return;
            // 352 px is the panel's own max width; clamped so a section at the right
            // edge of a narrow workspace opens inwards instead of off the screen.
            const width = Math.min(352, window.innerWidth * 0.8);
            setAnchor({
                left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
                top: rect.bottom + 4
            });
        };
        place();
        window.addEventListener("resize", place);
        // The bar itself scrolls, so the trigger moves under an open panel.
        window.addEventListener("scroll", place, true);
        return ()=>{
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [
        open
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                ref: trigger,
                type: "button",
                "aria-expanded": open,
                "aria-haspopup": "true",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap", open || active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"),
                // The first hover has to be intentional; once the bar is open, sliding
                // along it switches menus at once.
                onMouseEnter: onOpen,
                onMouseLeave: onLeave,
                onClick: (event)=>// `event.detail === 0` means the keyboard raised it, and a keyboard
                    // press should toggle rather than only open.
                    onToggle(event.detail === 0 ? "keyboard" : event.nativeEvent.pointerType ?? "mouse"),
                onFocus: ()=>{
                    if (anyOpen) onOpen();
                },
                onKeyDown: (event)=>{
                    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen();
                    }
                    if (event.key === "ArrowRight") {
                        event.preventDefault();
                        onStep(1);
                    }
                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        onStep(-1);
                    }
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: section.emoji
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                        lineNumber: 342,
                        columnNumber: 9
                    }, this),
                    section.label,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("size-3 transition-transform", open && "rotate-180"),
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                        lineNumber: 344,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 300,
                columnNumber: 7
            }, this),
            open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                role: "menu",
                "aria-label": section.label,
                onMouseEnter: onOpen,
                onMouseLeave: onLeave,
                style: anchor,
                // Fixed, not absolute. The bar scrolls horizontally, and an absolute
                // child of a scrolling container is clipped on both axes — the panel
                // would be cut off at the bar's own 40 px height. Positioning it
                // against the viewport also lets it be pushed back inside the screen
                // when the section it belongs to is near the right edge.
                //
                // z-60 rather than z-50: the context panel is z-50 and comes later in
                // the document, so an equal z-index would put the panel on top.
                className: "glass fixed z-60 w-[min(22rem,80vw)] overflow-hidden rounded-xl border p-1.5 shadow-2xl",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                    className: "max-h-[70vh] overflow-y-auto",
                    children: section.items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                            children: item.href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(MenuLink, {
                                item: item,
                                href: item.href,
                                active: isActive(pathname, item.href),
                                signedIn: signedIn,
                                onSelect: onClose
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                                lineNumber: 371,
                                columnNumber: 19
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SoonItem, {
                                item: item
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                                lineNumber: 379,
                                columnNumber: 19
                            }, this)
                        }, item.id, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                            lineNumber: 369,
                            columnNumber: 15
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                    lineNumber: 367,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 351,
                columnNumber: 9
            }, this) : null
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
        lineNumber: 299,
        columnNumber: 5
    }, this);
}
function MenuLink({ item, href, active, signedIn, onSelect }) {
    // Signed out, a members-only destination still shows — it is part of what
    // this platform is — but dimmed, and the login page it lands on says why.
    const gated = item.private && !signedIn;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: href,
        role: "menuitem",
        onClick: onSelect,
        "aria-current": active ? "page" : undefined,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm", active ? "bg-muted font-medium" : "hover:bg-muted/60", gated && "opacity-60"),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                className: "mt-0.5 size-4 shrink-0",
                "aria-hidden": true
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 419,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "min-w-0 flex-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "block truncate",
                        children: item.label
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                        lineNumber: 421,
                        columnNumber: 9
                    }, this),
                    item.hint ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "block truncate text-xs text-muted-foreground",
                        children: item.hint
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                        lineNumber: 423,
                        columnNumber: 11
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 420,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
        lineNumber: 408,
        columnNumber: 5
    }, this);
}
/** Specified but not built. Plainly disabled beats a link that goes nowhere. */ function SoonItem({ item }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "aria-disabled": true,
        title: `${item.label} — not built yet`,
        className: "flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground/50",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                className: "size-4 shrink-0",
                "aria-hidden": true
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 440,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "min-w-0 flex-1 truncate",
                children: item.label
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 441,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
                children: "Soon"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
                lineNumber: 442,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/menu-bar.tsx",
        lineNumber: 435,
        columnNumber: 5
    }, this);
}
/**
 * Whether a path is the one on screen.
 *
 * A prefix match, so `/designs/three-bay-wardrobe` lights up `/designs` — but
 * only on a segment boundary, or `/city` would also claim `/citymap`. The
 * query string is dropped first: several items differ only by `?tool=`, and
 * comparing those against a pathname never matches anything.
 */ function isActive(pathname, href) {
    const path = href.split("?")[0] ?? href;
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
}
}),
"[project]/supabase/migrations/src/components/shell/resize-handle.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ResizeHandle",
    ()=>ResizeHandle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ResizeHandle({ value, min, max, onChange, /** Which way a larger value grows: "right" for the left rail. */ grow, label }) {
    const start = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        pointer: 0,
        value: 0
    });
    const onPointerDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        event.preventDefault();
        start.current = {
            pointer: event.clientX,
            value
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [
        value
    ]);
    const onPointerMove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const delta = event.clientX - start.current.pointer;
        const next = start.current.value + (grow === "right" ? delta : -delta);
        onChange((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clamp"])(Math.round(next), min, max));
    }, [
        grow,
        max,
        min,
        onChange
    ]);
    const onKeyDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((event)=>{
        const step = event.shiftKey ? 24 : 8;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            onChange((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clamp"])(value + (grow === "right" ? -step : step), min, max));
        }
        if (event.key === "ArrowRight") {
            event.preventDefault();
            onChange((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clamp"])(value + (grow === "right" ? step : -step), min, max));
        }
    }, [
        grow,
        max,
        min,
        onChange,
        value
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": label,
        "aria-valuenow": value,
        "aria-valuemin": min,
        "aria-valuemax": max,
        tabIndex: 0,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onKeyDown: onKeyDown,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group relative z-10 -mx-0.5 w-1 shrink-0 cursor-col-resize touch-none", "focus-visible:outline-none"),
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
            "aria-hidden": true,
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors", "group-hover:bg-brand group-focus-visible:bg-brand")
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/resize-handle.tsx",
            lineNumber: 88,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/resize-handle.tsx",
        lineNumber: 72,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/layout/logo.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Logo",
    ()=>Logo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
function Logo({ className }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        href: "/",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2 text-lg font-semibold tracking-tight", className),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground text-sm font-bold",
                children: "M"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/layout/logo.tsx",
                lineNumber: 13,
                columnNumber: 7
            }, this),
            "Medosha"
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/layout/logo.tsx",
        lineNumber: 6,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/sidebar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Sidebar",
    ()=>Sidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-ssr] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pin$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/pin.mjs [app-ssr] (ecmascript) <export default as Pin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pin$2d$off$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PinOff$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/pin-off.mjs [app-ssr] (ecmascript) <export default as PinOff>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/star.mjs [app-ssr] (ecmascript) <export default as Star>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$logo$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/layout/logo.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
function Sidebar({ signedIn, counts }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const { navCollapsed, collapsedSections, pins } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    const active = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["matchNavItem"])(pathname, searchParams), [
        pathname,
        searchParams
    ]);
    const pinned = pins.map((id)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["findItem"])(id))// Narrows `href` too, not just the item — a predicate that only removes
    // `undefined` from the wrapper still leaves the link asserting.
    .filter((item)=>typeof item?.href === "string" && item.href.length > 0);
    function badgeFor(id) {
        if (id === "messages") return counts.messages;
        if (id === "notifications") return counts.notifications;
        return 0;
    }
    if (navCollapsed) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
            "aria-label": "Sections",
            className: "flex h-full w-full flex-col items-center gap-1 overflow-y-auto py-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/",
                    "aria-label": "Medosha home",
                    className: "mb-2 flex size-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground",
                    children: "M"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                    lineNumber: 64,
                    columnNumber: 9
                }, this),
                __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].map((section)=>{
                    const target = section.href ?? section.items.find((item)=>item.href)?.href;
                    const isActive = active?.section.id === section.id || section.href === "/" && pathname === "/";
                    if (!target) return null;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: target,
                        title: section.label,
                        "aria-label": section.label,
                        "aria-current": isActive ? "page" : undefined,
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex size-9 items-center justify-center rounded-lg transition-colors", isActive ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(section.icon, {
                            className: "size-4.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                            lineNumber: 92,
                            columnNumber: 15
                        }, this)
                    }, section.id, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                        lineNumber: 79,
                        columnNumber: 13
                    }, this);
                })
            ]
        }, void 0, true, {
            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
            lineNumber: 60,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        "aria-label": "Sections",
        className: "flex h-full flex-col overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex h-14 shrink-0 items-center px-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$logo$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Logo"], {}, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                    lineNumber: 106,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 105,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "min-h-0 flex-1 overflow-y-auto px-2 pb-6",
                children: [
                    pinned.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "mb-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Star$3e$__["Star"], {
                                        className: "size-3"
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                        lineNumber: 113,
                                        columnNumber: 15
                                    }, this),
                                    "My Workspace"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                lineNumber: 112,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                children: pinned.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Row, {
                                            item: item,
                                            href: item.href,
                                            active: active?.id === item.id,
                                            badge: badgeFor(item.id),
                                            pinned: true,
                                            signedIn: signedIn
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                            lineNumber: 119,
                                            columnNumber: 19
                                        }, this)
                                    }, `pin-${item.id}`, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                        lineNumber: 118,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                lineNumber: 116,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                        lineNumber: 111,
                        columnNumber: 11
                    }, this),
                    __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_SECTIONS"].map((section)=>{
                        // Home has no children; it renders as a single row.
                        if (section.items.length === 0 && section.href) {
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: section.href,
                                "aria-current": pathname === section.href ? "page" : undefined,
                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", pathname === section.href ? "bg-brand/12 text-brand" : "text-foreground/80 hover:bg-muted hover:text-foreground"),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        "aria-hidden": true,
                                        className: "text-base leading-none",
                                        children: section.emoji
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                        lineNumber: 148,
                                        columnNumber: 17
                                    }, this),
                                    section.label
                                ]
                            }, section.id, true, {
                                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                lineNumber: 137,
                                columnNumber: 15
                            }, this);
                        }
                        const folded = collapsedSections.includes(section.id);
                        const sectionActive = active?.section.id === section.id;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "mt-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toggleSection"])(section.id),
                                    "aria-expanded": !folded,
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors", sectionActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("size-3 transition-transform duration-150", !folded && "rotate-90")
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                            lineNumber: 172,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            "aria-hidden": true,
                                            className: "text-sm leading-none",
                                            children: section.emoji
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                            lineNumber: 178,
                                            columnNumber: 17
                                        }, this),
                                        section.label
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                    lineNumber: 161,
                                    columnNumber: 15
                                }, this),
                                !folded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                                    className: "mt-0.5",
                                    children: section.items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                            children: item.href ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Row, {
                                                item: item,
                                                href: item.href,
                                                active: active?.id === item.id,
                                                badge: badgeFor(item.id),
                                                pinned: pins.includes(item.id),
                                                signedIn: signedIn
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                                lineNumber: 189,
                                                columnNumber: 25
                                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(SoonRow, {
                                                item: item
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                                lineNumber: 198,
                                                columnNumber: 25
                                            }, this)
                                        }, item.id, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                            lineNumber: 187,
                                            columnNumber: 21
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                                    lineNumber: 185,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, section.id, true, {
                            fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                            lineNumber: 160,
                            columnNumber: 13
                        }, this);
                    })
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 109,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
        lineNumber: 101,
        columnNumber: 5
    }, this);
}
function Row({ item, href, active, badge, pinned, signedIn }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "group/row relative",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                href: href,
                "aria-current": active ? "page" : undefined,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex items-center gap-2.5 rounded-lg py-1.5 pr-9 pl-8 text-sm transition-colors", active ? "bg-brand/12 font-medium text-brand" : "text-foreground/75 hover:bg-muted hover:text-foreground"),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground")
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                        lineNumber: 239,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "min-w-0 flex-1 truncate",
                        children: item.label
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                        lineNumber: 245,
                        columnNumber: 9
                    }, this),
                    signedIn && badge > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "shrink-0 rounded-full bg-brand px-1.5 text-[10px] leading-4 font-medium text-brand-foreground",
                        children: badge > 99 ? "99+" : badge
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                        lineNumber: 249,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 229,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["togglePin"])(item.id),
                "aria-label": pinned ? `Unpin ${item.label} from My Workspace` : `Pin ${item.label} to My Workspace`,
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md", "text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground", "group-hover/row:opacity-100 focus-visible:opacity-100", pinned && "opacity-60"),
                children: pinned ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pin$2d$off$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PinOff$3e$__["PinOff"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                    lineNumber: 271,
                    columnNumber: 19
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pin$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pin$3e$__["Pin"], {
                    className: "size-3"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                    lineNumber: 271,
                    columnNumber: 51
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 256,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
        lineNumber: 228,
        columnNumber: 5
    }, this);
}
/**
 * A module in the manifest that has no destination yet.
 *
 * Rendered as a plainly disabled row rather than a link: a button that looks
 * live and does nothing is worse than one that says it is not ready.
 */ function SoonRow({ item }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "aria-disabled": true,
        title: `${item.label} — not built yet`,
        className: "flex cursor-not-allowed items-center gap-2.5 rounded-lg py-1.5 pr-3 pl-8 text-sm text-muted-foreground/50",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                className: "size-4 shrink-0"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 290,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "min-w-0 flex-1 truncate",
                children: item.label
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 291,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
                children: "Soon"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
                lineNumber: 292,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/sidebar.tsx",
        lineNumber: 285,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/split-pane.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SplitPane",
    ()=>SplitPane
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeftRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/arrow-left-right.mjs [app-ssr] (ecmascript) <export default as ArrowLeftRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/refresh-cw.mjs [app-ssr] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/x.mjs [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
function SplitPane({ href }) {
    const [reloadKey, setReloadKey] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [picking, setPicking] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const src = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const [path = "/", query = ""] = href.split("?");
        const params = new URLSearchParams(query);
        params.set("_pane", "1");
        return `${path}?${params.toString()}`;
    }, [
        href
    ]);
    const label = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const [path = "/", query = ""] = href.split("?");
        const item = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["matchNavItem"])(path, new URLSearchParams(query));
        return item?.label ?? path;
    }, [
        href
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full w-full min-w-0 flex-col border-l",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex h-9 shrink-0 items-center gap-1 border-b px-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setPicking((previous)=>!previous),
                        "aria-expanded": picking,
                        className: "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$arrow$2d$left$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ArrowLeftRight$3e$__["ArrowLeftRight"], {
                                className: "size-3.5 shrink-0 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                                lineNumber: 48,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate",
                                children: label
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                                lineNumber: 49,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setReloadKey((previous)=>previous + 1),
                        "aria-label": "Reload this pane",
                        title: "Reload",
                        className: "ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                            className: "size-3.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                            lineNumber: 59,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                        lineNumber: 52,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                splitHref: null
                            }),
                        "aria-label": "Close split view",
                        title: "Close split",
                        className: "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                            className: "size-3.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                            lineNumber: 68,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                        lineNumber: 61,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                lineNumber: 41,
                columnNumber: 7
            }, this),
            picking && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-h-64 shrink-0 overflow-y-auto border-b p-1.5",
                children: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LINKED_NAV_ITEMS"].map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                splitHref: item.href
                            });
                            setPicking(false);
                        },
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted", item.href === href && "bg-muted font-medium"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(item.icon, {
                                className: "size-3.5 shrink-0 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                                lineNumber: 87,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "min-w-0 flex-1 truncate",
                                children: item.label
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                                lineNumber: 88,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "shrink-0 text-xs text-muted-foreground",
                                children: item.section.label
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                                lineNumber: 89,
                                columnNumber: 15
                            }, this)
                        ]
                    }, item.id, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                        lineNumber: 75,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                lineNumber: 73,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("iframe", {
                src: src,
                title: `${label} — split view`,
                className: "min-h-0 w-full flex-1 border-0 bg-background"
            }, `${src}:${reloadKey}`, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/split-pane.tsx",
        lineNumber: 40,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/tab-bar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TabBar",
    ()=>TabBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$columns$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Columns2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/columns-2.mjs [app-ssr] (ecmascript) <export default as Columns2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/plus.mjs [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/x.mjs [app-ssr] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
function TabBar() {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const { tabs, splitHref } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    const current = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname;
    }, [
        pathname,
        searchParams
    ]);
    const label = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const item = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["matchNavItem"])(pathname, searchParams);
        if (item) return item.label;
        if (pathname === "/") return "Home";
        const last = pathname.split("/").filter(Boolean).pop() ?? "Workspace";
        return last.charAt(0).toUpperCase() + last.slice(1);
    }, [
        pathname,
        searchParams
    ]);
    // The tab for the route you are on is always present. Writing to the store
    // rather than to component state keeps this out of React's update cycle.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openTab"])({
            href: current,
            label
        });
    }, [
        current,
        label
    ]);
    function onClose(event, href) {
        event.preventDefault();
        event.stopPropagation();
        const remaining = tabs.filter((tab)=>tab.href !== href);
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["closeTab"])(href);
        // Closing the tab you are looking at has to move you somewhere.
        if (href === current) {
            router.push(remaining[remaining.length - 1]?.href ?? "/");
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-2 print:hidden",
        children: [
            tabs.map((tab)=>{
                const active = tab.href === current;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/tab flex h-7 shrink-0 items-center rounded-md text-xs transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"),
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: tab.href,
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("max-w-44 truncate py-1 pl-2.5", // The last tab has no close button, so it keeps its padding.
                            tabs.length > 1 ? "pr-1" : "pr-2.5"),
                            children: tab.label
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                            lineNumber: 75,
                            columnNumber: 13
                        }, this),
                        tabs.length > 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: (event)=>onClose(event, tab.href),
                            "aria-label": `Close ${tab.label}`,
                            className: "mr-1 flex size-4.5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/tab:opacity-100 focus-visible:opacity-100",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                                className: "size-3"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                                lineNumber: 94,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                            lineNumber: 88,
                            columnNumber: 15
                        }, this)
                    ]
                }, tab.href, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                    lineNumber: 66,
                    columnNumber: 11
                }, this);
            }),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex shrink-0 items-center gap-1 pl-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                splitHref: splitHref ? null : current
                            }),
                        "aria-pressed": Boolean(splitHref),
                        title: splitHref ? "Close split view" : "Split the workspace",
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors", splitHref ? "bg-brand/12 text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$columns$2d$2$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Columns2$3e$__["Columns2"], {
                                className: "size-3.5"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                                lineNumber: 116,
                                columnNumber: 11
                            }, this),
                            "Split"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                        lineNumber: 102,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: "/",
                        "aria-label": "Open a new workspace tab",
                        title: "New tab",
                        className: "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                            className: "size-3.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                            lineNumber: 125,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                        lineNumber: 119,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
                lineNumber: 101,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/tab-bar.tsx",
        lineNumber: 62,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Breadcrumbs",
    ()=>Breadcrumbs
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-ssr] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/navigation.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
function Breadcrumbs() {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const crumbs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$navigation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["breadcrumbsFor"])(pathname, searchParams), [
        pathname,
        searchParams
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        "aria-label": "Breadcrumb",
        className: "min-w-0",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ol", {
            className: "flex min-w-0 items-center gap-1 text-sm",
            children: crumbs.map((crumb, index)=>{
                const last = index === crumbs.length - 1;
                const early = index < crumbs.length - 2;
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                    className: early ? "hidden min-w-0 items-center md:flex" : "flex min-w-0 items-center",
                    children: [
                        index > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                            "aria-hidden": true,
                            className: "mr-1 size-3.5 shrink-0 text-muted-foreground/60"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
                            lineNumber: 39,
                            columnNumber: 17
                        }, this),
                        crumb.href && !last ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: crumb.href,
                            className: "truncate text-muted-foreground transition-colors hover:text-foreground",
                            children: crumb.label
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
                            lineNumber: 45,
                            columnNumber: 17
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            "aria-current": last ? "page" : undefined,
                            className: last ? "truncate font-medium text-foreground" : "truncate text-muted-foreground",
                            children: crumb.label
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
                            lineNumber: 52,
                            columnNumber: 17
                        }, this)
                    ]
                }, `${crumb.label}-${index}`, true, {
                    fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
                    lineNumber: 34,
                    columnNumber: 13
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
            lineNumber: 29,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx",
        lineNumber: 28,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/ui/button.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Button",
    ()=>Button,
    "buttonVariants",
    ()=>buttonVariants
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$button$2f$Button$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/@base-ui/react/button/Button.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/class-variance-authority/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
;
;
const buttonVariants = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$class$2d$variance$2d$authority$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cva"])("group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground hover:bg-primary/80",
            outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
            secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
            ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
            destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
            link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
            default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
            xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
            sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
            lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
            icon: "size-8",
            "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
            "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
            "icon-lg": "size-9"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
});
function Button({ className, variant = "default", size = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$button$2f$Button$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
        "data-slot": "button",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])(buttonVariants({
            variant,
            size,
            className
        })),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/button.tsx",
        lineNumber: 50,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/supabase/migrations/src/components/layout/theme-toggle.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThemeToggle",
    ()=>ThemeToggle
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/moon.mjs [app-ssr] (ecmascript) <export default as Moon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sun.mjs [app-ssr] (ecmascript) <export default as Sun>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next-themes/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/button.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
function ThemeToggle() {
    const { resolvedTheme, setTheme } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTheme"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
        variant: "ghost",
        size: "icon",
        "aria-label": "Toggle theme",
        onClick: ()=>setTheme(resolvedTheme === "dark" ? "light" : "dark"),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sun$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sun$3e$__["Sun"], {
                className: "size-4 dark:hidden"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/layout/theme-toggle.tsx",
                lineNumber: 18,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$moon$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Moon$3e$__["Moon"], {
                className: "hidden size-4 dark:block"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/layout/theme-toggle.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/layout/theme-toggle.tsx",
        lineNumber: 12,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DropdownMenu",
    ()=>DropdownMenu,
    "DropdownMenuCheckboxItem",
    ()=>DropdownMenuCheckboxItem,
    "DropdownMenuContent",
    ()=>DropdownMenuContent,
    "DropdownMenuGroup",
    ()=>DropdownMenuGroup,
    "DropdownMenuItem",
    ()=>DropdownMenuItem,
    "DropdownMenuLabel",
    ()=>DropdownMenuLabel,
    "DropdownMenuLinkItem",
    ()=>DropdownMenuLinkItem,
    "DropdownMenuPortal",
    ()=>DropdownMenuPortal,
    "DropdownMenuRadioGroup",
    ()=>DropdownMenuRadioGroup,
    "DropdownMenuRadioItem",
    ()=>DropdownMenuRadioItem,
    "DropdownMenuSeparator",
    ()=>DropdownMenuSeparator,
    "DropdownMenuShortcut",
    ()=>DropdownMenuShortcut,
    "DropdownMenuSub",
    ()=>DropdownMenuSub,
    "DropdownMenuSubContent",
    ()=>DropdownMenuSubContent,
    "DropdownMenuSubTrigger",
    ()=>DropdownMenuSubTrigger,
    "DropdownMenuTrigger",
    ()=>DropdownMenuTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/@base-ui/react/menu/index.parts.mjs [app-ssr] (ecmascript) <export * as Menu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRightIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-ssr] (ecmascript) <export default as ChevronRightIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/check.mjs [app-ssr] (ecmascript) <export default as CheckIcon>");
"use client";
;
;
;
;
function DropdownMenu({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Root, {
        "data-slot": "dropdown-menu",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 10,
        columnNumber: 10
    }, this);
}
function DropdownMenuPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Portal, {
        "data-slot": "dropdown-menu-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 14,
        columnNumber: 10
    }, this);
}
function DropdownMenuTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Trigger, {
        "data-slot": "dropdown-menu-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 18,
        columnNumber: 10
    }, this);
}
function DropdownMenuContent({ align = "start", alignOffset = 0, side = "bottom", sideOffset = 4, className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Portal, {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Positioner, {
            className: "isolate z-50 outline-none",
            align: align,
            alignOffset: alignOffset,
            side: side,
            sideOffset: sideOffset,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Popup, {
                "data-slot": "dropdown-menu-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95", className),
                ...props
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                lineNumber: 42,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
            lineNumber: 35,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 34,
        columnNumber: 5
    }, this);
}
function DropdownMenuGroup({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Group, {
        "data-slot": "dropdown-menu-group",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 53,
        columnNumber: 10
    }, this);
}
function DropdownMenuLabel({ className, inset, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].GroupLabel, {
        "data-slot": "dropdown-menu-label",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 64,
        columnNumber: 5
    }, this);
}
function DropdownMenuItem({ className, inset, variant = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Item, {
        "data-slot": "dropdown-menu-item",
        "data-inset": inset,
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
}
function DropdownMenuLinkItem({ className, inset, variant = "default", ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].LinkItem, {
        "data-slot": "dropdown-menu-link-item",
        "data-inset": inset,
        "data-variant": variant,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 109,
        columnNumber: 5
    }, this);
}
function DropdownMenuSub({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].SubmenuRoot, {
        "data-slot": "dropdown-menu-sub",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 123,
        columnNumber: 10
    }, this);
}
function DropdownMenuSubTrigger({ className, inset, children, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].SubmenuTrigger, {
        "data-slot": "dropdown-menu-sub-trigger",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
        ...props,
        children: [
            children,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRightIcon$3e$__["ChevronRightIcon"], {
                className: "ml-auto"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                lineNumber: 145,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 135,
        columnNumber: 5
    }, this);
}
function DropdownMenuSubContent({ align = "start", alignOffset = -3, side = "right", sideOffset = 0, className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DropdownMenuContent, {
        "data-slot": "dropdown-menu-sub-content",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className),
        align: align,
        alignOffset: alignOffset,
        side: side,
        sideOffset: sideOffset,
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 159,
        columnNumber: 5
    }, this);
}
function DropdownMenuCheckboxItem({ className, children, checked, inset, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].CheckboxItem, {
        "data-slot": "dropdown-menu-checkbox-item",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
        checked: checked,
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "pointer-events-none absolute right-2 flex items-center justify-center",
                "data-slot": "dropdown-menu-checkbox-item-indicator",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].CheckboxItemIndicator, {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                        lineNumber: 196,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                    lineNumber: 195,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                lineNumber: 191,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 181,
        columnNumber: 5
    }, this);
}
function DropdownMenuRadioGroup({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].RadioGroup, {
        "data-slot": "dropdown-menu-radio-group",
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 207,
        columnNumber: 5
    }, this);
}
function DropdownMenuRadioItem({ className, children, inset, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].RadioItem, {
        "data-slot": "dropdown-menu-radio-item",
        "data-inset": inset,
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", className),
        ...props,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "pointer-events-none absolute right-2 flex items-center justify-center",
                "data-slot": "dropdown-menu-radio-item-indicator",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].RadioItemIndicator, {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                        lineNumber: 237,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                    lineNumber: 236,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
                lineNumber: 232,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 223,
        columnNumber: 5
    }, this);
}
function DropdownMenuSeparator({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$base$2d$ui$2f$react$2f$menu$2f$index$2e$parts$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__Menu$3e$__["Menu"].Separator, {
        "data-slot": "dropdown-menu-separator",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("-mx-1 my-1 h-px bg-border", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 251,
        columnNumber: 5
    }, this);
}
function DropdownMenuShortcut({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        "data-slot": "dropdown-menu-shortcut",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx",
        lineNumber: 264,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/supabase/migrations/src/components/ui/skeleton.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Skeleton",
    ()=>Skeleton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
;
;
function Skeleton({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "skeleton",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("animate-pulse rounded-md bg-muted", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/skeleton.tsx",
        lineNumber: 5,
        columnNumber: 5
    }, this);
}
;
}),
"[project]/supabase/migrations/src/lib/supabase/client.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/@supabase/ssr/dist/module/createBrowserClient.js [app-ssr] (ecmascript)");
;
function createClient() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createBrowserClient"])(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
}),
"[project]/supabase/migrations/src/components/layout/user-nav.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UserNav",
    ()=>UserNav
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bookmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bookmark$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bookmark.mjs [app-ssr] (ecmascript) <export default as Bookmark>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs [app-ssr] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$credit$2d$card$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CreditCard$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/credit-card.mjs [app-ssr] (ecmascript) <export default as CreditCard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/layout-dashboard.mjs [app-ssr] (ecmascript) <export default as LayoutDashboard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/log-out.mjs [app-ssr] (ecmascript) <export default as LogOut>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/message-square.mjs [app-ssr] (ecmascript) <export default as MessageSquare>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/settings.mjs [app-ssr] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/user-round.mjs [app-ssr] (ecmascript) <export default as UserRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/avatar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/dropdown-menu.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/skeleton.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/supabase/client.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
/** Name shown in the nav. profiles has no display_name column, so the
 * fallback order collapses to full_name -> email. */ function resolveName(profile) {
    return profile.fullName?.trim() || profile.email || "Account";
}
function initialsFor(name) {
    const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((p)=>p[0]);
    return (letters.join("") || name[0] || "M").toUpperCase();
}
// "/profile" resolves the signed-in user server-side from Supabase Auth, so it
// always opens the viewer's own profile without threading an id through props.
const MENU_LINKS = [
    {
        href: "/profile",
        label: "My Profile",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__["UserRound"]
    },
    {
        href: "/dashboard",
        label: "Dashboard",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layout$2d$dashboard$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LayoutDashboard$3e$__["LayoutDashboard"]
    },
    {
        href: "/messages",
        label: "Messages",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquare$3e$__["MessageSquare"]
    },
    {
        href: "/saved",
        label: "Saved Items",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bookmark$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bookmark$3e$__["Bookmark"]
    },
    {
        href: "/billing",
        label: "Billing",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$credit$2d$card$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CreditCard$3e$__["CreditCard"]
    },
    {
        href: "/settings",
        label: "Settings",
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"]
    }
];
function UserNav({ initialProfile }) {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const [profile, setProfile] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialProfile ?? null);
    // The signed-in user's id always comes from Supabase Auth, never from props.
    const [userId, setUserId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [ready, setReady] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialProfile !== undefined);
    const [signingOut, setSigningOut] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const supabaseRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createClient"])());
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const supabase = supabaseRef.current;
        let active = true;
        // Resolve the session directly as well as through the listener: if the
        // subscription is slow or never fires, the menu still leaves its loading
        // state instead of showing a skeleton forever.
        void supabase.auth.getUser().then(({ data })=>{
            if (!active || !data.user) return;
            setUserId(data.user.id);
            setReady(true);
        }).catch(()=>{
            if (active) setReady(true);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session)=>{
            if (!active) return;
            if (!session?.user) {
                setProfile(null);
                setUserId(null);
                setReady(true);
                return;
            }
            setUserId(session.user.id);
            // Show something immediately from the session, then enrich with the
            // profile row (name + avatar) without blocking the first paint.
            setProfile((prev)=>({
                    fullName: prev?.fullName ?? null,
                    email: session.user.email ?? prev?.email ?? null,
                    avatarUrl: prev?.avatarUrl ?? null
                }));
            setReady(true);
            // maybeSingle(): a user can be authenticated before their profile row
            // exists (first sign-in), and that must not throw in the header.
            const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", session.user.id).maybeSingle();
            if (!active) return;
            setProfile({
                fullName: data?.full_name ?? null,
                email: session.user.email ?? null,
                avatarUrl: data?.avatar_url ?? null
            });
        });
        return ()=>{
            active = false;
            subscription.unsubscribe();
        };
    }, []);
    async function handleSignOut() {
        setSigningOut(true);
        try {
            // Browser sign-out clears the SSR cookies and fires onAuthStateChange,
            // so the nav flips to signed-out instantly without a page refresh.
            await supabaseRef.current.auth.signOut();
            router.push("/");
            router.refresh();
        } catch  {
            // Signing out failed (offline, expired session): send the user to the
            // login page rather than leaving a half-signed-out header.
            router.push("/login");
        } finally{
            setSigningOut(false);
        }
    }
    if (!ready) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Skeleton"], {
            className: "size-8 rounded-full",
            "aria-hidden": true
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
            lineNumber: 158,
            columnNumber: 12
        }, this);
    }
    if (!profile) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/login",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buttonVariants"])({
                        variant: "ghost"
                    }),
                    children: "Log in"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                    lineNumber: 164,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                    href: "/signup",
                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["buttonVariants"])(),
                    children: "Join Medosha"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                    lineNumber: 170,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true);
    }
    const name = resolveName(profile);
    const initials = initialsFor(name);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenu"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuTrigger"], {
                className: "flex items-center gap-2 rounded-full py-1 pr-2 pl-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Avatar"], {
                        className: "size-8",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AvatarImage"], {
                                src: profile.avatarUrl ?? undefined,
                                alt: name
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                lineNumber: 184,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$avatar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AvatarFallback"], {
                                className: "bg-brand text-brand-foreground",
                                children: initials
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                lineNumber: 185,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 183,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "hidden max-w-32 truncate text-sm font-medium sm:inline",
                        children: name
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 189,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                        className: "hidden size-4 text-muted-foreground sm:inline"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 192,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                lineNumber: 182,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuContent"], {
                align: "end",
                className: "w-56",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuGroup"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuLabel"], {
                            className: "flex flex-col gap-0.5 py-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate text-sm font-medium text-foreground",
                                    children: name
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                    lineNumber: 199,
                                    columnNumber: 13
                                }, this),
                                profile.email && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "truncate text-xs font-normal text-muted-foreground",
                                    children: profile.email
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                    lineNumber: 203,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                            lineNumber: 198,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 197,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuSeparator"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 209,
                        columnNumber: 9
                    }, this),
                    userId === null ? // Auth has not confirmed the session yet. Showing a loading row
                    // beats offering links that would bounce the user to /login.
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                className: "size-4 animate-spin",
                                "aria-hidden": true
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                lineNumber: 214,
                                columnNumber: 13
                            }, this),
                            "Loading your account…"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 213,
                        columnNumber: 11
                    }, this) : MENU_LINKS.map(({ href, label, icon: Icon })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuLinkItem"], {
                            render: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                href: href
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                lineNumber: 219,
                                columnNumber: 54
                            }, this),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                    className: "size-4"
                                }, void 0, false, {
                                    fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                    lineNumber: 220,
                                    columnNumber: 15
                                }, this),
                                " ",
                                label
                            ]
                        }, href, true, {
                            fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                            lineNumber: 219,
                            columnNumber: 13
                        }, this)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuSeparator"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 224,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$dropdown$2d$menu$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DropdownMenuItem"], {
                        variant: "destructive",
                        disabled: signingOut,
                        onClick: ()=>void handleSignOut(),
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$log$2d$out$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LogOut$3e$__["LogOut"], {
                                className: "size-4"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                                lineNumber: 230,
                                columnNumber: 11
                            }, this),
                            " Sign Out"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                        lineNumber: 225,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
                lineNumber: 194,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/layout/user-nav.tsx",
        lineNumber: 181,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/constants/search.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SEARCH_KINDS",
    ()=>SEARCH_KINDS,
    "SEARCH_KIND_ICON",
    ()=>SEARCH_KIND_ICON,
    "isSearchKind",
    ()=>isSearchKind,
    "searchKindLabel",
    ()=>searchKindLabel
]);
const SEARCH_KINDS = [
    {
        value: "product",
        label: "Products",
        plural: "products"
    },
    {
        value: "company",
        label: "Companies",
        plural: "companies"
    },
    {
        value: "professional",
        label: "Professionals",
        plural: "professionals"
    },
    {
        value: "project",
        label: "Projects",
        plural: "projects"
    },
    {
        value: "design",
        label: "Designs",
        plural: "furniture designs"
    },
    {
        value: "investment",
        label: "Investments",
        plural: "investment projects"
    },
    {
        value: "price",
        label: "Prices & materials",
        plural: "prices"
    },
    {
        value: "service",
        label: "Services",
        plural: "services"
    },
    {
        value: "equipment",
        label: "Equipment",
        plural: "equipment"
    },
    {
        value: "job",
        label: "Jobs",
        plural: "jobs"
    },
    {
        value: "event",
        label: "Events",
        plural: "events"
    },
    {
        value: "post",
        label: "Posts",
        plural: "posts"
    },
    {
        value: "hashtag",
        label: "Hashtags",
        plural: "hashtags"
    }
];
function isSearchKind(value) {
    return SEARCH_KINDS.some((kind)=>kind.value === value);
}
function searchKindLabel(kind) {
    return SEARCH_KINDS.find((k)=>k.value === kind)?.label ?? kind;
}
const SEARCH_KIND_ICON = {
    product: "Package",
    company: "Building2",
    professional: "UserRound",
    project: "Hammer",
    price: "LineChart",
    service: "Wrench",
    equipment: "Truck",
    job: "Briefcase",
    event: "CalendarDays",
    post: "MessageSquare",
    hashtag: "Hash",
    investment: "Landmark",
    design: "Armchair"
};
}),
"[project]/supabase/migrations/src/components/search/global-search.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GlobalSearch",
    ()=>GlobalSearch
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-ssr] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/search.mjs [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$kind$2d$icon$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/search/kind-icon.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ui/button.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$search$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/constants/search.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
/**
 * The one search box.
 *
 * Searches everything — products, companies, professionals, projects, prices,
 * services, equipment, jobs, events, posts and hashtags — through a single
 * endpoint, and offers Medosha AI as the last option when nothing in the
 * catalogue answers the question.
 *
 * Requests are debounced and the in-flight one is aborted when the next
 * keystroke lands, so a fast typist cannot leave a slow early response to
 * overwrite a fast later one.
 */ const DEBOUNCE_MS = 180;
const MIN_CHARS = 2;
function GlobalSearch({ placeholder = "Search products, companies, professionals, prices…", size = "default", autoFocus = false, initialQuery = "" }) {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const listId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useId"])();
    const [term, setTerm] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(initialQuery);
    const [results, setResults] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [active, setActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(-1);
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const inputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    // One suggestion request per settled keystroke, and never two in flight.
    // Nothing is set synchronously here: a query below the threshold is handled
    // by deriving the visible results below, not by clearing state in an effect.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const query = term.trim();
        if (query.length < MIN_CHARS) return;
        const controller = new AbortController();
        const timer = setTimeout(async ()=>{
            setLoading(true);
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal
                });
                if (!response.ok) throw new Error("search failed");
                const data = await response.json();
                setResults(data.results ?? []);
                setActive(-1);
            } catch  {
                // An abort is the normal path when typing continues; a real failure
                // leaves the box usable and the form still submits to /search.
                if (!controller.signal.aborted) setResults([]);
            } finally{
                if (!controller.signal.aborted) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return ()=>{
            clearTimeout(timer);
            controller.abort();
        };
    }, [
        term
    ]);
    // Clicking away closes the panel; Escape is handled on the input itself.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        function onPointerDown(event) {
            if (!containerRef.current?.contains(event.target)) setOpen(false);
        }
        document.addEventListener("pointerdown", onPointerDown);
        return ()=>document.removeEventListener("pointerdown", onPointerDown);
    }, []);
    const query = term.trim();
    const longEnough = query.length >= MIN_CHARS;
    // Derived rather than stored: shrinking the query back below the threshold
    // hides the previous results without an effect having to clear them.
    const visible = longEnough ? results : [];
    const busy = loading && longEnough;
    // The AI option always sits last, so it has an index past the results.
    const aiIndex = visible.length;
    const optionCount = visible.length + 1;
    const showPanel = open && longEnough;
    function go(href) {
        setOpen(false);
        router.push(href);
    }
    function askAi() {
        go(`/ai?q=${encodeURIComponent(term.trim())}`);
    }
    function submit(event) {
        event.preventDefault();
        if (!query) return;
        if (active >= 0 && active < visible.length) {
            {
                const hit = visible[active];
                if (hit) go(hit.href);
            }
            return;
        }
        if (active === aiIndex) {
            askAi();
            return;
        }
        go(`/search?q=${encodeURIComponent(query)}`);
    }
    function onKeyDown(event) {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }
        if (!showPanel || optionCount === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index)=>(index + 1) % optionCount);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index)=>index <= 0 ? optionCount - 1 : index - 1);
        }
    }
    const hero = size === "hero";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "relative w-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                onSubmit: submit,
                role: "search",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("glass flex items-center gap-2 rounded-2xl border shadow-sm transition-shadow", hero ? "p-2" : "p-1.5", showPanel && "rounded-b-none"),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("ml-2 shrink-0 text-muted-foreground", hero ? "size-5" : "size-4")
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 165,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        ref: inputRef,
                        value: term,
                        autoFocus: autoFocus,
                        onChange: (event)=>{
                            setTerm(event.target.value);
                            setOpen(true);
                        },
                        onFocus: ()=>setOpen(true),
                        onKeyDown: onKeyDown,
                        placeholder: placeholder,
                        "aria-label": "Search Medosha",
                        role: "combobox",
                        "aria-expanded": showPanel,
                        "aria-controls": listId,
                        "aria-autocomplete": "list",
                        "aria-activedescendant": active >= 0 ? `${listId}-option-${active}` : undefined,
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("w-full bg-transparent outline-none placeholder:text-muted-foreground", hero ? "h-10 text-base" : "h-8 text-sm")
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 171,
                        columnNumber: 9
                    }, this),
                    busy && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                        className: "size-4 shrink-0 animate-spin text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 196,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Button"], {
                        type: "submit",
                        size: hero ? "lg" : "sm",
                        className: "shrink-0",
                        children: "Search"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 198,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                lineNumber: 156,
                columnNumber: 7
            }, this),
            showPanel && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                id: listId,
                role: "listbox",
                "aria-label": "Search suggestions",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("absolute inset-x-0 top-full z-50 overflow-hidden rounded-b-2xl border border-t-0", "bg-popover shadow-xl"),
                children: [
                    visible.length === 0 && !busy && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "px-4 py-3 text-sm text-muted-foreground",
                        children: "Nothing in the catalogue matches that."
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 214,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "max-h-96 overflow-y-auto",
                        children: [
                            visible.map((result, index)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        type: "button",
                                        id: `${listId}-option-${index}`,
                                        role: "option",
                                        "aria-selected": active === index,
                                        onPointerEnter: ()=>setActive(index),
                                        onClick: ()=>go(result.href),
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", active === index ? "bg-muted" : "hover:bg-muted/60"),
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$kind$2d$icon$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SearchKindIcon"], {
                                                    kind: result.kind,
                                                    className: "size-4"
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                    lineNumber: 235,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                lineNumber: 234,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "min-w-0 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "block truncate text-sm font-medium",
                                                        children: result.title
                                                    }, void 0, false, {
                                                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                        lineNumber: 238,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: "block truncate text-xs text-muted-foreground",
                                                        children: [
                                                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$constants$2f$search$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["searchKindLabel"])(result.kind),
                                                            result.subtitle ? ` · ${result.subtitle}` : ""
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                        lineNumber: 241,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                lineNumber: 237,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                        lineNumber: 222,
                                        columnNumber: 17
                                    }, this)
                                }, `${result.kind}-${result.id}`, false, {
                                    fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                    lineNumber: 221,
                                    columnNumber: 15
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "border-t",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    id: `${listId}-option-${aiIndex}`,
                                    role: "option",
                                    "aria-selected": active === aiIndex,
                                    onPointerEnter: ()=>setActive(aiIndex),
                                    onClick: askAi,
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", active === aiIndex ? "bg-muted" : "hover:bg-muted/60"),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                className: "size-4"
                                            }, void 0, false, {
                                                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                lineNumber: 266,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                            lineNumber: 265,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "min-w-0 flex-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "block truncate text-sm font-medium",
                                                    children: [
                                                        "Ask Medosha AI about “",
                                                        term.trim(),
                                                        "”"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                    lineNumber: 269,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "block text-xs text-muted-foreground",
                                                    children: "Costs, materials, suppliers and schedules"
                                                }, void 0, false, {
                                                    fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                                    lineNumber: 272,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                            lineNumber: 268,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                    lineNumber: 253,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                                lineNumber: 252,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 219,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>go(`/search?q=${encodeURIComponent(term.trim())}`),
                        className: "block w-full border-t px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                        children: [
                            "See all results for “",
                            term.trim(),
                            "”"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                        lineNumber: 280,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
                lineNumber: 204,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/search/global-search.tsx",
        lineNumber: 155,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/components/shell/topbar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Topbar",
    ()=>Topbar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bell$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bell$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/bell.mjs [app-ssr] (ecmascript) <export default as Bell>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/menu.mjs [app-ssr] (ecmascript) <export default as Menu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/panel-left.mjs [app-ssr] (ecmascript) <export default as PanelLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/panel-right.mjs [app-ssr] (ecmascript) <export default as PanelRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/search.mjs [app-ssr] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/sparkles.mjs [app-ssr] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$breadcrumbs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/breadcrumbs.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/layout/theme-toggle.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$user$2d$nav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/layout/user-nav.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$global$2d$search$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/search/global-search.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
function Topbar({ profile, notifications, panelOpen, onTogglePanel, onOpenMobileNav }) {
    const { navCollapsed, aiOpen } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3 print:hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onOpenMobileNav,
                "aria-label": "Open navigation",
                className: "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$menu$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Menu$3e$__["Menu"], {
                    className: "size-4.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                    lineNumber: 45,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                        navCollapsed: !navCollapsed
                    }),
                "aria-label": navCollapsed ? "Expand navigation" : "Collapse navigation",
                "aria-pressed": navCollapsed,
                title: navCollapsed ? "Expand navigation" : "Collapse navigation",
                className: "hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$left$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelLeft$3e$__["PanelLeft"], {
                    className: "size-4.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                    lineNumber: 56,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "hidden min-w-0 flex-1 sm:block",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$breadcrumbs$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Breadcrumbs"], {}, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                    lineNumber: 60,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                lineNumber: 59,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "hidden flex-1 sm:block md:max-w-md",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$search$2f$global$2d$search$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["GlobalSearch"], {
                    placeholder: "Search everything…  ⌘K"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex shrink-0 items-center gap-0.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: "/search",
                        "aria-label": "Search",
                        className: "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                            className: "size-4.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                            lineNumber: 75,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>{
                            if (aiOpen && panelOpen) {
                                (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["closePanel"])();
                                return;
                            }
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"])();
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                aiOpen: true
                            });
                        },
                        "aria-pressed": aiOpen,
                        "aria-label": "Medosha AI",
                        title: "Ask Medosha AI",
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("flex size-8 items-center justify-center rounded-lg transition-colors", aiOpen ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                            className: "size-4.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                            lineNumber: 98,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, this),
                    profile && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                        href: "/notifications",
                        "aria-label": notifications > 0 ? `Notifications, ${notifications} unread` : "Notifications",
                        className: "relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bell$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bell$3e$__["Bell"], {
                                className: "size-4.5"
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                                lineNumber: 111,
                                columnNumber: 13
                            }, this),
                            notifications > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium text-brand-foreground",
                                children: notifications > 99 ? "99+" : notifications
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                                lineNumber: 113,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 102,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$theme$2d$toggle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ThemeToggle"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 120,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$layout$2f$user$2d$nav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["UserNav"], {
                        initialProfile: profile
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 121,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: onTogglePanel,
                        "aria-label": panelOpen ? "Hide context panel" : "Show context panel",
                        "aria-pressed": panelOpen,
                        title: panelOpen ? "Hide context panel" : "Show context panel",
                        className: "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRight$3e$__["PanelRight"], {
                            className: "size-4.5"
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                            lineNumber: 131,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                        lineNumber: 123,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
                lineNumber: 69,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/topbar.tsx",
        lineNumber: 38,
        columnNumber: 5
    }, this);
}
}),
"[project]/supabase/migrations/src/lib/workspace/use-live-counts.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useLiveCounts",
    ()=>useLiveCounts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/supabase/client.ts [app-ssr] (ecmascript)");
"use client";
;
;
const EMPTY = {
    messages: 0,
    notifications: 0,
    ready: false
};
let state = EMPTY;
const listeners = new Set();
function subscribe(listener) {
    listeners.add(listener);
    return ()=>{
        listeners.delete(listener);
    };
}
function getSnapshot() {
    return state;
}
function getServerSnapshot() {
    return EMPTY;
}
function set(next) {
    if (state.ready && next.messages === state.messages && next.notifications === state.notifications) {
        return;
    }
    state = {
        ...next,
        ready: true
    };
    for (const listener of listeners)listener();
}
function useLiveCounts(seed, enabled) {
    const live = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])(subscribe, getSnapshot, getServerSnapshot);
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createClient"])(), []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!enabled) return;
        let cancelled = false;
        let timer = null;
        async function recount() {
            const [messages, notifications] = await Promise.all([
                supabase.rpc("unread_message_count"),
                supabase.rpc("unread_notification_count")
            ]);
            if (cancelled) return;
            // A failed RPC returns null. Keeping the previous number is better than
            // showing zero, which would read as "all caught up".
            set({
                messages: typeof messages.data === "number" ? messages.data : state.messages,
                notifications: typeof notifications.data === "number" ? notifications.data : state.notifications
            });
        }
        function schedule() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(recount, 250);
        }
        // Once at mount, so the badges are right even when the server render was
        // cached before the latest message arrived.
        void recount();
        const channel = supabase.channel("workspace:counts").on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "messages"
        }, schedule).on("postgres_changes", {
            event: "UPDATE",
            schema: "public",
            table: "conversation_participants"
        }, schedule).on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "notifications"
        }, schedule).subscribe();
        return ()=>{
            cancelled = true;
            if (timer) clearTimeout(timer);
            void supabase.removeChannel(channel);
        };
    }, [
        enabled,
        supabase
    ]);
    if (!enabled) return {
        messages: 0,
        notifications: 0
    };
    return live.ready ? {
        messages: live.messages,
        notifications: live.notifications
    } : seed;
}
}),
"[project]/supabase/migrations/src/lib/workspace/use-media-query.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useMediaQuery",
    ()=>useMediaQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
function useMediaQuery(query) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSyncExternalStore"])((listener)=>{
        if ("TURBOPACK compile-time truthy", 1) return ()=>{};
        //TURBOPACK unreachable
        ;
        const list = undefined;
    }, ()=>window.matchMedia(query).matches, ()=>false);
}
}),
"[project]/supabase/migrations/src/components/shell/app-shell.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AppShell",
    ()=>AppShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRight$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/panel-right.mjs [app-ssr] (ecmascript) <export default as PanelRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$ai$2d$launcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/ai/ai-launcher.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$bottom$2d$nav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/bottom-nav.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$command$2d$palette$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/command-palette.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$context$2d$panel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/context-panel.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$menu$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/menu-bar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$quick$2d$actions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/quick-actions.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$resize$2d$handle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/resize-handle.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/sidebar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$split$2d$pane$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/split-pane.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$tab$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/tab-bar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$topbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/components/shell/topbar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$live$2d$counts$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-live-counts.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$media$2d$query$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-media-query.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/workspace/use-shell.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/utils.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
function AppShell({ children, profile, counts, homeWidget }) {
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["usePathname"])() ?? "/";
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const shell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$shell$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useShell"])();
    const [mobileNav, setMobileNav] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const live = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$live$2d$counts$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useLiveCounts"])(counts, Boolean(profile));
    // The panel is a column from lg up and a sheet below it, and the two want
    // opposite defaults — open beside a wide workspace, shut over a narrow one.
    const desktop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$use$2d$media$2d$query$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMediaQuery"])("(min-width: 1024px)");
    const panelOpen = desktop ? !shell.panelCollapsed : shell.panelMobile;
    const bare = searchParams?.get("_pane") === "1" || AUTH_ROUTES.some((route)=>pathname.startsWith(route));
    if (bare) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "min-h-screen",
            children: children
        }, void 0, false, {
            fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
            lineNumber: 76,
            columnNumber: 12
        }, this);
    }
    const signedIn = Boolean(profile);
    const navWidth = shell.navCollapsed ? 60 : shell.navWidth;
    return(// Printing is the one time the workspace is not a fixed-height, internally
    // scrolling application. A cut list on paper has to be the whole document,
    // not the 900 pixels that happened to be in view, so `print:` unpicks the
    // shell: the panels go, the height cap goes, and the workspace becomes an
    // ordinary flowing page the browser can paginate.
    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-screen overflow-hidden bg-background print:block print:h-auto print:overflow-visible",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    width: navWidth
                },
                className: "hidden shrink-0 border-r bg-sidebar lg:block print:hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sidebar"], {
                    signedIn: signedIn,
                    counts: live
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                    lineNumber: 94,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 90,
                columnNumber: 7
            }, this),
            !shell.navCollapsed && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "hidden lg:block",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$resize$2d$handle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ResizeHandle"], {
                    label: "Resize navigation",
                    value: shell.navWidth,
                    min: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_WIDTH"].min,
                    max: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["NAV_WIDTH"].max,
                    grow: "right",
                    onChange: (next)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                            navWidth: next
                        })
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                    lineNumber: 99,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 98,
                columnNumber: 9
            }, this),
            mobileNav && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed inset-0 z-60 lg:hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        "aria-label": "Close navigation",
                        onClick: ()=>setMobileNav(false),
                        className: "absolute inset-0 cursor-default bg-black/50"
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 113,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative h-full w-[280px] border-r bg-sidebar",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$sidebar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sidebar"], {
                            signedIn: signedIn,
                            counts: live
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                            lineNumber: 120,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 119,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 112,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-w-0 flex-1 flex-col print:block",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$topbar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Topbar"], {
                        profile: profile,
                        notifications: live.notifications,
                        panelOpen: panelOpen,
                        onTogglePanel: ()=>panelOpen ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["closePanel"])() : (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"])(),
                        onOpenMobileNav: ()=>setMobileNav(true)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 127,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$menu$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MenuBar"], {
                        signedIn: signedIn
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 136,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$tab$2d$bar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["TabBar"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 137,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1 print:block",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                                id: "workspace",
                                style: shell.splitHref ? {
                                    flex: `0 0 ${(shell.splitRatio * 100).toFixed(2)}%`
                                } : undefined,
                                // A named container query context.
                                //
                                // Collapsing the rail or closing the context panel changes how
                                // much room this column has, but not the viewport — so a layout
                                // built on `lg:` breakpoints does not notice, and the page stays
                                // the narrow shape it had when both panels were open. Pages that
                                // want to reflow use `@…/ws:` variants and respond to the space
                                // they actually have.
                                className: "@container/ws min-w-0 flex-1 overflow-y-auto overscroll-contain pb-14 lg:pb-0 print:overflow-visible print:pb-0",
                                children: children
                            }, void 0, false, {
                                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                                lineNumber: 140,
                                columnNumber: 11
                            }, this),
                            shell.splitHref && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$resize$2d$handle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ResizeHandle"], {
                                        label: "Resize split",
                                        value: Math.round(shell.splitRatio * 1000),
                                        min: Math.round(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPLIT_RATIO"].min * 1000),
                                        max: Math.round(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPLIT_RATIO"].max * 1000),
                                        grow: "right",
                                        onChange: (next)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                                splitRatio: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clamp"])(next / 1000, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPLIT_RATIO"].min, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SPLIT_RATIO"].max)
                                            })
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                                        lineNumber: 162,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden min-w-0 flex-1 md:block",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$split$2d$pane$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SplitPane"], {
                                            href: shell.splitHref
                                        }, void 0, false, {
                                            fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                                            lineNumber: 179,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                                        lineNumber: 178,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 139,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 126,
                columnNumber: 7
            }, this),
            panelOpen && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "hidden lg:block",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$resize$2d$handle$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ResizeHandle"], {
                            label: "Resize context panel",
                            value: shell.panelWidth,
                            min: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PANEL_WIDTH"].min,
                            max: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PANEL_WIDTH"].max,
                            grow: "left",
                            onChange: (next)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["update"])({
                                    panelWidth: next
                                })
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                            lineNumber: 190,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 189,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            width: shell.panelWidth
                        },
                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["cn"])("shrink-0 border-l print:hidden", // Below lg it floats over the workspace rather than squeezing it.
                        "fixed inset-y-0 right-0 z-50 max-w-[90vw] shadow-2xl", "lg:static lg:z-auto lg:max-w-none lg:shadow-none"),
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$context$2d$panel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ContextPanel"], {
                            signedIn: signedIn,
                            homeWidget: homeWidget
                        }, void 0, false, {
                            fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                            lineNumber: 208,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 199,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true),
            !panelOpen && desktop && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$workspace$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["openPanel"],
                "aria-label": "Show context panel",
                title: "Show context panel",
                className: "fixed top-1/2 right-0 z-40 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground print:hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRight$3e$__["PanelRight"], {
                    className: "size-3.5"
                }, void 0, false, {
                    fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                    lineNumber: 223,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 216,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    // Below lg the panel floats over the workspace, so the buttons
                    // stay at the screen edge; from lg up they step aside for it.
                    "--fab-right": panelOpen ? `${shell.panelWidth}px` : "0px"
                },
                className: "pointer-events-none fixed right-0 bottom-14 z-40 flex flex-col items-end gap-3 p-5 lg:right-[var(--fab-right)] lg:bottom-0 print:hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$ai$2f$ai$2d$launcher$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AiLauncher"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 239,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$quick$2d$actions$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["QuickActions"], {}, void 0, false, {
                        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                        lineNumber: 240,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 229,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$bottom$2d$nav$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BottomNav"], {
                signedIn: signedIn
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 245,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$components$2f$shell$2f$command$2d$palette$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["CommandPalette"], {}, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
                lineNumber: 247,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/supabase/migrations/src/components/shell/app-shell.tsx",
        lineNumber: 88,
        columnNumber: 5
    }, this));
}
/** Routes that render without the workspace frame. */ const AUTH_ROUTES = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/auth/"
];
}),
"[project]/supabase/migrations/src/components/ui/sonner.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Toaster",
    ()=>Toaster
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/next-themes/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleCheckIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/circle-check.mjs [app-ssr] (ecmascript) <export default as CircleCheckIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__InfoIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/info.mjs [app-ssr] (ecmascript) <export default as InfoIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TriangleAlertIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/triangle-alert.mjs [app-ssr] (ecmascript) <export default as TriangleAlertIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$octagon$2d$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__OctagonXIcon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/octagon-x.mjs [app-ssr] (ecmascript) <export default as OctagonXIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2Icon$3e$__ = __turbopack_context__.i("[project]/supabase/migrations/node_modules/lucide-react/dist/esm/icons/loader-circle.mjs [app-ssr] (ecmascript) <export default as Loader2Icon>");
"use client";
;
;
;
;
const Toaster = ({ ...props })=>{
    const { theme = "system" } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2d$themes$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useTheme"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Toaster"], {
        theme: theme,
        className: "toaster group",
        icons: {
            success: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CircleCheckIcon$3e$__["CircleCheckIcon"], {
                className: "size-4"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
                lineNumber: 16,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0)),
            info: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$info$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__InfoIcon$3e$__["InfoIcon"], {
                className: "size-4"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
                lineNumber: 19,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0)),
            warning: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TriangleAlertIcon$3e$__["TriangleAlertIcon"], {
                className: "size-4"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
                lineNumber: 22,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0)),
            error: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$octagon$2d$x$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__OctagonXIcon$3e$__["OctagonXIcon"], {
                className: "size-4"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
                lineNumber: 25,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0)),
            loading: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2Icon$3e$__["Loader2Icon"], {
                className: "size-4 animate-spin"
            }, void 0, false, {
                fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
                lineNumber: 28,
                columnNumber: 11
            }, ("TURBOPACK compile-time value", void 0))
        },
        style: {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)"
        },
        toastOptions: {
            classNames: {
                toast: "cn-toast"
            }
        },
        ...props
    }, void 0, false, {
        fileName: "[project]/supabase/migrations/src/components/ui/sonner.tsx",
        lineNumber: 11,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/dynamic-access-async-storage.external.js [external] (next/dist/server/app-render/dynamic-access-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/dynamic-access-async-storage.external.js", () => require("next/dist/server/app-render/dynamic-access-async-storage.external.js"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__00lqaju._.js.map