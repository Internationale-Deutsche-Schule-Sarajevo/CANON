import { BookOpen, Sprout, Target, Mountain, Trophy, Star, Flame, Gem, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { BADGES, type BadgeId } from "@/constants/gamification";
import { formatDateBs, type BadgeListItem } from "@/features/gamification/service";

/**
 * One icon per badge. Line icons instead of the emoji stored in badges.emoji:
 * the mandate rules out generic emoji, and this map is the single place to
 * swap in the real emblem artwork later.
 */
const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  [BADGES.FIRST_CHAPTER]: BookOpen,
  [BADGES.QUARTER]: Sprout,
  [BADGES.HALFWAY]: Target,
  [BADGES.THREE_QUARTERS]: Mountain,
  [BADGES.COMPLETE]: Trophy,
  [BADGES.PERFECT_FIRST]: Star,
  [BADGES.STREAK_7]: Flame,
  [BADGES.STREAK_30]: Gem,
  [BADGES.NO_MISTAKES]: Sparkles,
  [BADGES.SPEED]: Zap,
};

/**
 * All badges, unlocked in full colour and locked greyed out (existing
 * .badge-icon / .badge-icon.locked classes). Unlocked show the unlock date,
 * locked show the condition, both as visible text (not only a hover tooltip)
 * so it works on touch screens and for screen readers. Static presentation.
 */
export function BadgeGrid({ badges }: { badges: BadgeListItem[] }) {
  return (
    <ul className="badge-grid">
      {badges.map((badge) => {
        const Icon = BADGE_ICONS[badge.id];
        const detail = badge.unlocked && badge.awardedAt ? `Otključano ${formatDateBs(badge.awardedAt)}` : badge.description;
        return (
          <li key={badge.id} className={`badge-item${badge.unlocked ? "" : " locked"}`} title={`${badge.name}: ${detail}`}>
            <span className={`badge-icon${badge.unlocked ? "" : " locked"}`}>
              <Icon size={24} aria-hidden="true" />
            </span>
            <span className="badge-item-text">
              <span className="badge-item-name">{badge.name}</span>
              <span className="badge-item-detail">{detail}</span>
            </span>
            <span className="sr-only">{badge.unlocked ? "Otključano" : "Zaključano"}</span>
          </li>
        );
      })}
    </ul>
  );
}
