-- Create storage bucket for participant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('participant-logos', 'participant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for participant logo uploads
CREATE POLICY "Authenticated users can upload participant logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'participant-logos');

CREATE POLICY "Authenticated users can update participant logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'participant-logos');

CREATE POLICY "Anyone can view participant logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'participant-logos');

CREATE POLICY "Authenticated users can delete participant logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'participant-logos');