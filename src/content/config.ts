import { defineCollection, z } from "astro:content";

const legal = defineCollection({
  schema: z.object({
    page: z.string(),
    pubDate: z.date(),
  }),
});

const jobs = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      type: z.string(),
      jobLevel: z.string().optional(),
      jobType: z.string().optional(),
      updated: z.string().optional(),
      category: z.string(),
      tags: z.array(z.string()),
      salary: z.string().optional(),
      experienceLevel: z.string().optional(),
      datePosted: z.date(),
      applyUrl: z.string(),
      deadline: z.date().optional(),
      flag: z
        .object({
          url: image(),     
          alt: z.string(),
        })
        .optional(),
      isFeatured: z.boolean().optional(),
      isClosed: z.boolean().optional(),
    }),
});

const companies = defineCollection({
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      founded: z.string().optional(),
      headquarters: z.string().optional(),
      website: z.string(),
      hiringPage: z.string().optional(),
      description: z.string(),
      logo: image().optional(),   // ✅ single image path (keep simple)
      location: z.string().optional(),
      size: z.string().optional(),
      industry: z.string().optional(),
      benefits: z.array(z.string()).optional(),
      companyType: z.string().optional(),
      remotePolicy: z.string().optional(),
      culture: z.string().optional(),
      mission: z.string().optional(),
      about: z.string().optional(),
      values: z.array(z.string()).optional(),
      milestones: z.array(z.string()).optional(),
      socials: z
        .object({
          twitter: z.string().optional(),
          linkedin: z.string().optional(),
          github: z.string().optional(),
        })
        .optional(),
    }),
});

const candidates = defineCollection({
  schema: ({ image }) =>
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
      resumeUrl: z.string().optional(),
      coverLetter: z.string().optional(),
      location: z.string().optional(),
      experienceLevel: z.string().optional(),
      jobPreferences: z.array(z.string()).optional(),
      dateApplied: z.string(),
      linkedinProfile: z.string().optional(),
      githubProfile: z.string().optional(),
      portfolioUrl: z.string().optional(),
      status: z.string().optional(),
      avatar: z
        .object({
          url: image(),     
          alt: z.string(),
        })
        .optional(),
      isFeatured: z.boolean().optional(),
    }),
});

const team = defineCollection({
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string().optional(),
      bio: z.string().optional(),
      image: z.object({
        url: image(),       
        alt: z.string(),
      }),
      socials: z
        .object({
          twitter: z.string().optional(),
          website: z.string().optional(),
          linkedin: z.string().optional(),
          email: z.string().optional(),
        })
        .optional(),
    }),
});

const posts = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.date(),
      description: z.string(),
      team: z.string(),
      image: z.object({
        url: image(),       
        alt: z.string(),
      }),
      tags: z.array(z.string()),
    }),
});

const helpcenter = defineCollection({
  schema: z.object({
    iconId: z.string().optional(),
    page: z.string(),
    description: z.string(),
    category: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    lastUpdated: z.string().optional(),
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .optional(),
  }),
});

export const collections = {
  jobs,
  team,
  helpcenter,
  candidates,
  legal,
  companies,
posts,
};
