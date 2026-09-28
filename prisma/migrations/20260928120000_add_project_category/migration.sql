-- AlterTable: add discovery category to Project (nullable, lowercase)
ALTER TABLE "Project" ADD COLUMN "category" TEXT;
