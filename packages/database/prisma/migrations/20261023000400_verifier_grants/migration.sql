-- Verification portal: minimal extra privileges discovered while wiring the app.
--  * link a pre-registered officer to their Supabase account on first sign-in
--  * read its own verification events (to attach a review request)
--  * resolve file ownership when streaming a vehicle photo
GRANT UPDATE ("auth_user_id") ON "users" TO dds_verifier;
GRANT SELECT ON "verification_events", "supporting_documents" TO dds_verifier;
