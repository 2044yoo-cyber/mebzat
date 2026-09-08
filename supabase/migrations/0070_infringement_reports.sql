-- ---------------------------------------------------------------------------
-- Reporting stolen work
-- ---------------------------------------------------------------------------
--
-- 0069 puts a mark into published photographs so that a lifted one can be
-- traced back. That only helps if the person who finds their own photograph on
-- somebody else's listing has somewhere to say so, and until now they did not:
-- the closest option was "Something else", which files a copyright claim
-- alongside spam and gives the moderator nothing to act on.
--
-- Deliberately not one of the categories a classifier can return. Whether a
-- photograph is somebody's own work is not a judgement a model can make from
-- the pixels — it needs the person who took it. `provider.ts` maps no
-- provider label to this value, and nothing here changes the automatic path.

alter type public.moderation_category add value if not exists 'infringement';

-- A note on severity. `nextLevel()` in the application treats
-- `sexual_minors`, `illegal` and `threats` as severe — a single report
-- restricts the account. This is not on that list, on purpose: a copyright
-- claim is one person's word against another's until somebody looks, and a
-- first claim that suspends an account is a weapon handed to a competitor.
