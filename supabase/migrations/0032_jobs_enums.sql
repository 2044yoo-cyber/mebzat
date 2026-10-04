-- Jobs — enum extensions.
--
-- Separate from 0033 for the same reason 0028 is separate from 0029:
-- PostgreSQL will not let a transaction use an enum value that the same
-- transaction added. A value added here and referenced in 0033 would fail with
--
--   unsafe use of new value "hired" of enum type application_status
--
-- Run this file first, on its own, then 0033.
--
-- Nothing here is wrapped in a transaction, deliberately. `alter type ... add
-- value` is the one statement that must not be.

-- ---------------------------------------------------------------------------
-- The end of the hiring pipeline
-- ---------------------------------------------------------------------------
--
-- `application_status` already runs submitted → reviewing → shortlisted →
-- interviewing → offered → rejected → withdrawn. It stops one step short of
-- the thing the whole pipeline exists for: an offer that was accepted.
--
-- 'offered' is the employer's decision. 'hired' is the agreement — it is what
-- creates a working relationship, a conversation and, later, a contract.
alter type public.application_status add value if not exists 'hired';

-- ---------------------------------------------------------------------------
-- What can now happen to you
-- ---------------------------------------------------------------------------
--
-- `job_application` already exists and covers "somebody applied to your job".
-- These are the other side of the conversation: the applicant hearing back.
--
-- One kind for every movement through the pipeline rather than one per status.
-- A notification tray that offers 'application_shortlisted',
-- 'application_rejected' and 'application_interviewing' as separate kinds is a
-- tray with three icons that mean "your application moved"; the status itself
-- is in the notification's own text, where a person reads it.
alter type public.notification_kind add value if not exists 'application_update';
alter type public.notification_kind add value if not exists 'job_hired';
alter type public.notification_kind add value if not exists 'job_deadline';

-- ---------------------------------------------------------------------------
-- Messaging context
-- ---------------------------------------------------------------------------
--
-- `start_direct_conversation` takes a context so a thread knows what it is
-- about — a project, a product, a company, a profile. A conversation opened
-- from a job is about the job, and without this value it would have to claim
-- to be about a profile, which is how threads lose the thing that started
-- them.
alter type public.message_context add value if not exists 'job';
