
-- Drop the overly broad INSERT policy
DROP POLICY IF EXISTS "Users can upload proposal files" ON storage.objects;

-- Drop the overly broad UPDATE policy
DROP POLICY IF EXISTS "Users can update proposal files" ON storage.objects;

-- Drop the overly broad DELETE policy
DROP POLICY IF EXISTS "Users can delete proposal files" ON storage.objects;
