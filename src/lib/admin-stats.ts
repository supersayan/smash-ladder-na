import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus, ReportStatus, UserStatus } from "@/generated/prisma/enums";

export async function getAdminOverview() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    activeUsers24h,
    totalUsers,
    suspendedUsers,
    bannedUsers,
    matchesToday,
    disputedGameCandidates,
    openReports,
    lobbyWaiting,
    matchesInProgress,
    openTournaments,
  ] = await Promise.all([
    prisma.user.count({ where: { updatedAt: { gte: dayAgo } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    prisma.user.count({ where: { status: UserStatus.BANNED } }),
    prisma.ratingMatch.count({ where: { createdAt: { gte: dayAgo } } }),
    // A disputed game no longer flips the whole match to a blocking status
    // — "disputed" now lives at the game level (winnerId still null, but
    // both a report and a conflicting second report exist). Prisma can't
    // compare two columns in a where clause, so the not-equal check happens
    // in JS below on this narrowed-down candidate set. Excludes games whose
    // match already CONFIRMED/CANCELLED via its other games — same "moot"
    // exclusion listDisputedGames uses, otherwise this count only ever grows
    // (nothing ever revisits a disputed game once its match is closed out).
    prisma.matchGame.findMany({
      where: {
        winnerId: null,
        reportedWinnerId: { not: null },
        secondReportWinnerId: { not: null },
        match: { status: { notIn: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED] } },
      },
      select: { reportedWinnerId: true, secondReportWinnerId: true },
    }),
    prisma.conductReport.count({ where: { status: ReportStatus.OPEN } }),
    prisma.ratingLobbyEntry.count({ where: { status: LobbyEntryStatus.WAITING } }),
    // Not a lobby-entry count: RatingLobbyEntry.status never transitions off
    // PAIRED once a match is created (see getActiveLobbyEntry's "orphaned
    // PAIRED entry" handling), so that count only ever grows and never
    // reflects matches that have since finished. Counting the match's own
    // still-live statuses instead is the only way this number ever goes back
    // down.
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
    }),
    prisma.tournament.count({ where: { status: { in: ["SIGNUPS", "IN_PROGRESS"] } } }),
  ]);

  const openDisputes = disputedGameCandidates.filter(
    (g) => g.reportedWinnerId !== g.secondReportWinnerId,
  ).length;

  return {
    activeUsers24h,
    totalUsers,
    suspendedUsers,
    bannedUsers,
    matchesToday,
    openDisputes,
    openReports,
    lobbyWaiting,
    matchesInProgress,
    openTournaments,
  };
}
