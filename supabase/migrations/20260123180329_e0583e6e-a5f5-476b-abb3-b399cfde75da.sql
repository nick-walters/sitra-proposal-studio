-- Create storage bucket for all proposal-related files
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-files', 'proposal-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to view all proposal files
CREATE POLICY "Proposal files are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'proposal-files');

-- Allow authenticated users with proposal access to upload files
-- Files are stored as: {proposal_id}/{category}/{filename}
CREATE POLICY "Users can upload proposal files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proposal-files');

-- Allow users to update their uploaded files
CREATE POLICY "Users can update proposal files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'proposal-files');

-- Allow users to delete proposal files
CREATE POLICY "Users can delete proposal files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'proposal-files');