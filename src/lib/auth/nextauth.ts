import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { staffUsers } from "../db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: "admin" | "support" | "viewer";
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) return null;

        const [staff] = await db
          .select()
          .from(staffUsers)
          .where(eq(staffUsers.email, email))
          .limit(1);

        if (!staff || !staff.active || !staff.passwordHash) return null;

        const ok = await bcrypt.compare(password, staff.passwordHash);
        if (!ok) return null;

        await db
          .update(staffUsers)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(staffUsers.id, staff.id));

        return {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          image: staff.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const [staff] = await db
          .select()
          .from(staffUsers)
          .where(eq(staffUsers.email, user.email))
          .limit(1);
        if (staff) {
          token.id = staff.id;
          token.role = staff.role;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "admin" | "support" | "viewer") ?? "viewer";
      }
      return session;
    },
  },
});
