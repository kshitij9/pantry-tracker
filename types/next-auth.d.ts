import { DefaultSession } from "next-auth";

/**
 * Extend the Auth.js session/JWT to carry our custom fields:
 *   - user.id            : the database user id
 *   - user.activeHouseId : the house the user is currently acting on
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeHouseId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    activeHouseId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    activeHouseId: string | null;
  }
}
