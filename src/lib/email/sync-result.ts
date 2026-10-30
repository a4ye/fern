export type SyncResult =
    | {
          ok: true;
          found: number;
          scanned: number;
          remaining: number;
          hasMore: boolean;
          initialScanLimited: boolean;
      }
    | {
          ok: false;
          reason:
              | "unauthenticated"
              | "not_approved"
              | "not_connected"
              | "auth_expired"
              | "ai_unconfigured"
              | "error";
          message: string;
      };
