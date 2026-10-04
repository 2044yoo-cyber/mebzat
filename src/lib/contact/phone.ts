/**
 * A phone number in the form wa.me will accept.
 *
 * Ethiopian mobiles are written 09xx locally and +2519xx internationally, and
 * both spellings arrive in the same column because both are what people type.
 * Handing wa.me the local form opens a chat with whatever number that is in
 * the *reader's* country, which is a stranger — so the country code is added
 * rather than assumed, and anything that cannot be made sense of returns null
 * so the caller can draw something other than a link to nobody.
 */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;

  if (bare.startsWith("251")) return bare.length >= 12 ? bare : null;
  if (bare.startsWith("0")) {
    const local = bare.slice(1);
    return local.length >= 9 ? `251${local}` : null;
  }
  return bare.length >= 9 ? bare : null;
}
