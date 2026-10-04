"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  updateProfile,
  type EditProfileState,
} from "@/app/(dashboard)/profile/edit/actions";
import { PlacePicker } from "@/components/location/place-picker";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { DocumentUpload } from "@/components/profile/document-upload";
import { CoverUpload } from "@/components/profile/cover-upload";
import {
  TradeAndAreas,
  type AreaOption,
} from "@/components/profile/trade-and-areas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TokenPicker } from "@/components/ui/token-picker";
import { ACCOUNT_TYPES } from "@/lib/constants/account-types";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/constants/industries";
import { parseLanguages, searchLanguages } from "@/lib/constants/languages";
import { isTravelRadius, parseSpecialties } from "@/lib/constants/professions";
import {
  applyDraftToForm,
  clearDraft,
  isDraftWorthKeeping,
  readDraft,
  valuesFromForm,
  writeDraft,
} from "@/lib/projects/draft";
import { digitsOnly, MAX_YEARS } from "@/lib/profile/experience";
import { detailsOf } from "@/lib/profile/profession-fields";
import { ORGANIZATION_ACCOUNT_TYPES } from "@/lib/validations/profile";
import type { AccountType, Profile } from "@/types/database.types";

const initialState: EditProfileState = {};

const SAVE_DEBOUNCE_MS = 600;

/**
 * The unfinished edit, kept where a page navigation cannot reach it.
 *
 * Reuses `@/lib/projects/draft` — every function in it is generic over a
 * `<form>` element and a `Storage`, and only its `images`/`primary` fields are
 * project-specific. This form has no images to protect: the avatar and cover
 * upload the moment a file is picked, so nothing here is lost to a refresh
 * before Save is pressed. Both are passed through empty.
 *
 * ## What is not restored
 *
 * A profession's own answers — crew size, sectors, licence numbers, the
 * `detail:*` fields `ProfessionFieldsForm` renders — are not. Several of them
 * post more than one value under the same name (a multi-select), and this
 * module's flat `Record<string, string>` keeps only the last one written for
 * a name. Reconstructing that correctly needs the field's type, which lives
 * in `profession-fields.ts`, and doing that partially — one checkbox restored
 * out of three, with nothing to say so — is worse than leaving that block to
 * the server's own copy and asking somebody to re-answer it if a save was
 * genuinely lost. Everything above it — name, contact, bio, languages, the
 * trade itself, service areas — is a plain form field and is restored in
 * full.
 */
function draftStorageKey(profileId: string): string {
  return `medosha:profile-draft:${profileId}`;
}

/** No subscription: the draft is read once, when the form opens. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function EditProfileForm({
  profile,
  areas = [],
  serviceAreaSlugs = [],
}: {
  profile: Profile;
  areas?: AreaOption[];
  serviceAreaSlugs?: string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );
  const [accountType, setAccountType] = useState<AccountType>(
    profile.account_type ?? "individual",
  );
  const [years, setYears] = useState(
    profile.years_experience === null ? "" : String(profile.years_experience),
  );
  const [languages, setLanguages] = useState<string[]>(profile.languages ?? []);

  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = draftStorageKey(profile.id);

  // Read once, the same way project-form reads it: through
  // useSyncExternalStore rather than an effect, so there is no render where a
  // draft that exists renders as though it did not (localStorage does not
  // exist on the server, so the server snapshot is always null, which is
  // correct there and would otherwise be a hydration mismatch here).
  const snapshot = useRef<string | null | undefined>(undefined);
  const stored = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (snapshot.current === undefined) {
        try {
          snapshot.current = window.localStorage.getItem(draftKey);
        } catch {
          snapshot.current = null;
        }
      }
      return snapshot.current;
    },
    () => null,
  );

  const found = stored
    ? (() => {
        try {
          return readDraft(window.localStorage, draftKey);
        } catch {
          return null;
        }
      })()
    : null;

  const [answered, setAnswered] = useState(false);
  const hasOffer = !answered && isDraftWorthKeeping(found);
  const offer = hasOffer ? found : null;
  const settled = answered || !isDraftWorthKeeping(found);

  // What TradeAndAreas mounts with. Null means "the server's own values" —
  // its normal behaviour. Set once, by continuing a draft, and never again:
  // TradeAndAreas only reads its props at mount, so changing this alone would
  // do nothing without the `key` below forcing a fresh one.
  const [tradeSeed, setTradeSeed] = useState<{
    profession: string | null;
    specialties: string[];
    baseArea: string | null;
    serviceAreaSlugs: string[];
    travelRadiusKm: number | null;
    servesEntireCity: boolean;
    workStatus: string;
  } | null>(null);
  const [restoreNonce, setRestoreNonce] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    writeDraft(window.localStorage, draftKey, {
      values: valuesFromForm(form),
      images: [],
      primary: null,
    });
  }, [draftKey]);

  const queueSave = useCallback(() => {
    if (!settled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
  }, [save, settled]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function continueDraft() {
    const form = formRef.current;
    if (!form || !offer) return;

    // Every plain-named field — the majority of the form, including the
    // trade's own text inputs — restores through the DOM directly. The ones
    // React also holds as state (account type, years, languages, and
    // everything TradeAndAreas owns) need telling separately, or a later
    // re-render of just that field would overwrite the restored value with
    // the state it was still holding.
    applyDraftToForm(form, offer.values);

    const draftAccountType = offer.values.accountType;
    if (ACCOUNT_TYPES.some((t) => t.value === draftAccountType)) {
      setAccountType(draftAccountType as AccountType);
    }
    setYears(digitsOnly(offer.values.yearsExperience ?? ""));
    setLanguages(parseLanguages(offer.values.languages));

    const radius = Number(offer.values.travelRadius);
    setTradeSeed({
      profession: offer.values.profession || null,
      specialties: parseSpecialties(offer.values.specialties ?? null),
      baseArea: offer.values.baseArea || null,
      serviceAreaSlugs: (offer.values.serviceAreas ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      travelRadiusKm: isTravelRadius(radius) ? radius : null,
      servesEntireCity: offer.values.servesEntireCity === "on",
      workStatus: offer.values.workStatus || profile.work_status,
    });
    setRestoreNonce((n) => n + 1);
    setAnswered(true);
  }

  function discardDraft() {
    clearDraft(window.localStorage, draftKey);
    snapshot.current = null;
    setAnswered(true);
  }

  // The confirmation the save actually happened, not a stale draft. Without
  // this, refreshing after a successful save could still offer to "continue"
  // a draft written before that save — the exact overwrite-with-something-
  // older the brief asks not to do.
  useEffect(() => {
    if (state.savedAt) {
      clearDraft(window.localStorage, draftKey);
      snapshot.current = null;
    }
  }, [state.savedAt, draftKey]);

  const languageOptions = useCallback(
    (query: string) =>
      searchLanguages(query).map((language) => ({
        value: language.name,
        label: language.name,
        hint: language.native ?? null,
      })),
    [],
  );

  /**
   * The confirmation, once per save.
   *
   * Keyed on `savedAt` rather than on `success`, because `success` is a boolean
   * that is already `true` when the second save finishes — the dependency array
   * sees no change and the effect never runs, so saving twice in a row confirmed
   * once. That is the whole of the "Saved doesn't work properly" report.
   */
  useEffect(() => {
    if (state.savedAt) toast.success("Profile saved");
  }, [state.savedAt]);

  // A failure was a line of red text below the submit button, off the bottom of
  // a long form on a phone. It gets the same channel as the success.
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error, state.erroredAt]);

  const isOrganization = ORGANIZATION_ACCOUNT_TYPES.has(accountType);
  const displayName = profile.company_name || profile.full_name || "Unnamed";

  return (
    <div className="overflow-hidden rounded-2xl border">
      <CoverUpload userId={profile.id} coverUrl={profile.cover_url} />

      <div className="-mt-16 px-6 sm:-mt-20">
        <AvatarUpload
          userId={profile.id}
          avatarUrl={profile.avatar_url}
          displayName={displayName}
        />
      </div>

      <form
        ref={formRef}
        action={formAction}
        onInput={queueSave}
        onChange={queueSave}
        className="space-y-4 p-6"
      >
        {offer && (
          <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
            <p className="text-sm font-medium">
              You have unsaved profile changes.
            </p>
            <p className="text-xs text-muted-foreground">
              The details you had typed, kept on this device.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={continueDraft}>
                <RotateCcw className="size-4" /> Continue editing
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={discardDraft}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="accountType">Account type</Label>
          <Select
            name="accountType"
            value={accountType}
            onValueChange={(value) => setAccountType(value as AccountType)}
          >
            <SelectTrigger id="accountType" className="w-full">
              <SelectValue placeholder="Choose account type" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">
            {isOrganization ? "Your name" : "Full name"}
          </Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={profile.full_name ?? ""}
            required
          />
          {state.fieldErrors?.fullName && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.fullName}
            </p>
          )}
        </div>

        {isOrganization && (
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              name="companyName"
              defaultValue={profile.company_name ?? ""}
              required
            />
            {state.fieldErrors?.companyName && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.companyName}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            defaultValue={profile.username ?? ""}
            required
          />
          {state.fieldErrors?.username && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.username}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="locationCity">City or area</Label>
            <PlacePicker
              id="locationCity"
              name="locationCity"
              defaultValue={profile.location_city}
              placeholder="Ayertena, Bole, Bahir Dar…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locationCountry">Country</Label>
            <Input
              id="locationCountry"
              name="locationCountry"
              defaultValue={profile.location_country ?? ""}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
            />
          </div>
          {isOrganization ? (
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <select
                id="industry"
                name="industry"
                defaultValue={profile.industry ?? ""}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Not set</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </div>
          ) : (
          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Years of experience</Label>
            {/* Controlled and filtered rather than `type="number"`: a number
                input still accepts "e", "+" and "-", still lets a phone keyboard
                offer letters, and reports the lot as an empty value rather than
                as the text somebody actually typed. */}
            <Input
              id="yearsExperience"
              name="yearsExperience"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={years}
              onChange={(event) => setYears(digitsOnly(event.target.value))}
              placeholder="5"
              aria-describedby="yearsExperience-hint"
            />
            <p id="yearsExperience-hint" className="text-xs text-muted-foreground">
              {years ? `Shown as “${years} ${years === "1" ? "yr." : "yrs."}”` : `Numbers only, up to ${MAX_YEARS}.`}
            </p>
          </div>
          )}
        </div>

        {isOrganization && (
          <div className="space-y-2">
            <Label htmlFor="companySize">Company size</Label>
            <select
              id="companySize"
              name="companySize"
              defaultValue={profile.company_size ?? ""}
              className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Not set</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* A firm does not have a trade, specialties or a travel radius — its
            people do, and they have their own profiles. Asked of a person
            only, which is also why the completion rule for an organisation
            does not count it. */}
        {!isOrganization && (
        <TradeAndAreas
          // Remounted on a restored draft: TradeAndAreas reads these props
          // only at mount, so a changed key is what makes a new profession or
          // areas selection actually take.
          key={restoreNonce}
          areas={areas}
          profession={tradeSeed?.profession ?? profile.profession}
          specialties={tradeSeed?.specialties ?? profile.specialties ?? []}
          baseArea={tradeSeed?.baseArea ?? profile.base_area}
          serviceAreaSlugs={tradeSeed?.serviceAreaSlugs ?? serviceAreaSlugs}
          travelRadiusKm={tradeSeed?.travelRadiusKm ?? profile.travel_radius_km}
          servesEntireCity={tradeSeed?.servesEntireCity ?? profile.serves_entire_city}
          workStatus={tradeSeed?.workStatus ?? profile.work_status}
          professionDetails={detailsOf(profile)}
        />
        )}

        {/* Off unless asked for. A number entered to receive a confirmation
            code used to be published on the public profile as a side effect of
            having entered it. */}
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            What visitors can see
          </legend>
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id="showPhone"
              name="showPhone"
              defaultChecked={profile.show_phone}
              className="mt-1"
            />
            <div className="space-y-0.5">
              <Label htmlFor="showPhone" className="font-medium">
                Show my phone number on my profile
              </Label>
              <p className="text-xs text-muted-foreground">
                Anyone can see it, signed in or not. Leave it off and people
                reach you through Medosha messages instead.
              </p>
            </div>
          </div>
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id="showEmail"
              name="showEmail"
              defaultChecked={profile.show_email}
              className="mt-1"
            />
            <div className="space-y-0.5">
              <Label htmlFor="showEmail" className="font-medium">
                Show my email address on my profile
              </Label>
              <p className="text-xs text-muted-foreground">
                A published address is an address that gets scraped.
              </p>
            </div>
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            placeholder="https://example.com"
            defaultValue={profile.website ?? ""}
          />
          {state.fieldErrors?.website && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.website}
            </p>
          )}
        </div>

        {/* Somebody looking for work. An employer is never asked for a CV —
            that was the complaint, and the account type already knew. */}
        {!isOrganization && (
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">
              What you send with an application
            </legend>
            <p className="text-xs text-muted-foreground">
              Uploaded once and kept here. Every job you apply for offers them,
              and each employer sees them only if you say so.
            </p>

            <DocumentUpload
              userId={profile.id}
              kind="cv"
              filename={profile.cv_filename}
              updatedAt={profile.cv_updated_at}
            />
            <DocumentUpload
              userId={profile.id}
              kind="portfolio"
              filename={profile.portfolio_filename}
              updatedAt={profile.portfolio_updated_at}
            />

            <div className="space-y-2">
              <Label htmlFor="portfolioLink">Portfolio link</Label>
              <Input
                id="portfolioLink"
                name="portfolioLink"
                placeholder="https://behance.net/…"
                defaultValue={profile.portfolio_link ?? ""}
              />
              {state.fieldErrors?.portfolioLink && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.portfolioLink}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn</Label>
              <Input
                id="linkedinUrl"
                name="linkedinUrl"
                placeholder="https://linkedin.com/in/…"
                defaultValue={profile.linkedin_url ?? ""}
              />
              {state.fieldErrors?.linkedinUrl && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.linkedinUrl}
                </p>
              )}
            </div>
          </fieldset>
        )}

        <div className="space-y-2">
          <Label id="languages-label">Languages</Label>
          <TokenPicker
            name="languages"
            labelledBy="languages-label"
            value={languages}
            onChange={setLanguages}
            search={languageOptions}
            placeholder="Amharic, Afaan Oromo, English…"
            emptyText="Not on our list — type it and add it"
            max={12}
          />
          <p className="text-xs text-muted-foreground">
            Pick as many as you work in. Anything missing can be typed and
            added.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            name="bio"
            rows={4}
            defaultValue={profile.bio ?? ""}
          />
          {state.fieldErrors?.bio && (
            <p className="text-sm text-destructive">{state.fieldErrors.bio}</p>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
