import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const page = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    hero_image: z.string().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./content/news" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    excerpt: z.string().optional(),
    image: z.string().optional(),
  }),
});

const coach = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/coaches" }),
  schema: z.object({
    name: z.string(),
    credential_level: z.enum(["ACC", "PCC", "MCC"]).optional(),
    region: z.string().optional(),
    languages: z.array(z.string()).optional(),
    specialties: z.array(z.string()).optional(),
    coaching_approach: z.string().optional(),
    contact_url: z.string().optional(),
    photo: z.string().optional(),
    consent_public: z.boolean().optional(),
  }),
});

const boardMember = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/board-members" }),
  schema: z.object({
    name: z.string(),
    title: z.string().optional(),
    photo: z.string().optional(),
    order: z.number().optional(),
  }),
});

export const collections = { page, news, coach, boardMember };
