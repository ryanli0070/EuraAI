--
-- PostgreSQL database dump
--

\restrict pCpy822IhKsMXAw8exEFCetfyUrylJ2gBadEsaB4xI5v1uWVUHsLGWwWOi1lvVV

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: set_modified_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_modified_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.modified_at = now();
  return new;
end;
$$;


--
-- Name: user_preferences_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_preferences_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: canvases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canvases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    sort_order double precision DEFAULT 0 NOT NULL,
    thumbnail_path text,
    drawing_path text,
    chat_box jsonb,
    chat_latex_draft text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modified_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canvas_id uuid NOT NULL,
    role text NOT NULL,
    text text NOT NULL,
    status text,
    sort_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))),
    CONSTRAINT chat_messages_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'checking'::text, 'ok'::text, 'all_correct'::text, 'no_math'::text, 'error'::text])))
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    sort_order double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    modified_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: canvases canvases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: canvases_user_modified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvases_user_modified_idx ON public.canvases USING btree (user_id, modified_at DESC);


--
-- Name: canvases_user_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX canvases_user_parent_idx ON public.canvases USING btree (user_id, parent_id, sort_order);


--
-- Name: chat_messages_canvas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_canvas_idx ON public.chat_messages USING btree (canvas_id, sort_index);


--
-- Name: folders_user_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_user_parent_idx ON public.folders USING btree (user_id, parent_id, sort_order);


--
-- Name: canvases canvases_set_modified_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER canvases_set_modified_at BEFORE UPDATE ON public.canvases FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();


--
-- Name: folders folders_set_modified_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER folders_set_modified_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();


--
-- Name: user_preferences user_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.user_preferences_set_updated_at();


--
-- Name: canvases canvases_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: canvases canvases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canvases
    ADD CONSTRAINT canvases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_canvas_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_canvas_id_fkey FOREIGN KEY (canvas_id) REFERENCES public.canvases(id) ON DELETE CASCADE;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folders folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: canvases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;

--
-- Name: canvases canvases: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "canvases: delete own" ON public.canvases FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: canvases canvases: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "canvases: insert own" ON public.canvases FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: canvases canvases: select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "canvases: select own" ON public.canvases FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: canvases canvases: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "canvases: update own" ON public.canvases FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages: delete via owned canvas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_messages: delete via owned canvas" ON public.chat_messages FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.canvases c
  WHERE ((c.id = chat_messages.canvas_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: chat_messages chat_messages: insert via owned canvas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_messages: insert via owned canvas" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.canvases c
  WHERE ((c.id = chat_messages.canvas_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: chat_messages chat_messages: select via owned canvas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_messages: select via owned canvas" ON public.chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.canvases c
  WHERE ((c.id = chat_messages.canvas_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: chat_messages chat_messages: update via owned canvas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat_messages: update via owned canvas" ON public.chat_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.canvases c
  WHERE ((c.id = chat_messages.canvas_id) AND (c.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.canvases c
  WHERE ((c.id = chat_messages.canvas_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: folders folders: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "folders: delete own" ON public.folders FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: folders folders: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "folders: insert own" ON public.folders FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: folders folders: select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "folders: select own" ON public.folders FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: folders folders: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "folders: update own" ON public.folders FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences user_preferences: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_preferences: delete own" ON public.user_preferences FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences user_preferences: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_preferences: insert own" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences user_preferences: select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_preferences: select own" ON public.user_preferences FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences user_preferences: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_preferences: update own" ON public.user_preferences FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TABLE canvases; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.canvases TO anon;
GRANT ALL ON TABLE public.canvases TO authenticated;
GRANT ALL ON TABLE public.canvases TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE folders; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.folders TO anon;
GRANT ALL ON TABLE public.folders TO authenticated;
GRANT ALL ON TABLE public.folders TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_preferences TO anon;
GRANT ALL ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict pCpy822IhKsMXAw8exEFCetfyUrylJ2gBadEsaB4xI5v1uWVUHsLGWwWOi1lvVV


-- =====================================================================
-- Storage schema (captured separately; the dump above is --schema=public)
--   buckets: rows in storage.buckets | policies: RLS on storage.objects
-- =====================================================================

-- Buckets
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('drawings', 'drawings', NULL, '2026-05-27 21:39:38.20762+00', '2026-05-27 21:39:38.20762+00', false, false, NULL, NULL, NULL, 'STANDARD');
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('thumbnails', 'thumbnails', NULL, '2026-05-27 21:39:38.20762+00', '2026-05-27 21:39:38.20762+00', false, false, NULL, NULL, NULL, 'STANDARD');

-- Policies on storage.objects
CREATE POLICY "drawings: delete own" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'drawings'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "drawings: insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'drawings'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "drawings: select own" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'drawings'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "drawings: update own" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'drawings'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'drawings'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "thumbnails: delete own" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'thumbnails'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "thumbnails: insert own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'thumbnails'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "thumbnails: select own" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'thumbnails'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
CREATE POLICY "thumbnails: update own" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'thumbnails'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'thumbnails'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1])));
