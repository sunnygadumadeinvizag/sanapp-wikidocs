-- Section-level publish rules: which primary roles / users may create pages here.
ALTER TABLE "WikiSection" ADD COLUMN IF NOT EXISTS "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WikiSection" ADD COLUMN IF NOT EXISTS "allowedUsers" TEXT[] DEFAULT ARRAY[]::TEXT[];
