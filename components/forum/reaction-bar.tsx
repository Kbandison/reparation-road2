'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ThumbsUp, Lightbulb, HelpCircle } from 'lucide-react';

interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: string;
}

interface ReactionBarProps {
  postId: string;
  reactions: Reaction[];
  currentUserId: string;
}

const reactionTypes = [
  { type: 'like', icon: ThumbsUp, label: 'Like' },
  { type: 'helpful', icon: HelpCircle, label: 'Helpful' },
  { type: 'insightful', icon: Lightbulb, label: 'Insightful' },
] as const;

export function ReactionBar({ postId, reactions: initialReactions, currentUserId }: ReactionBarProps) {
  const [reactions, setReactions] = useState(initialReactions);

  async function toggleReaction(type: string) {
    if (!currentUserId) return;
    const supabase = createClient();

    const existing = reactions.find(
      (r) => r.user_id === currentUserId && r.reaction_type === type
    );

    if (existing) {
      await supabase.from('forum_reactions').delete().eq('id', existing.id);
      setReactions(reactions.filter((r) => r.id !== existing.id));
    } else {
      const { data } = await supabase
        .from('forum_reactions')
        .insert({ post_id: postId, user_id: currentUserId, reaction_type: type })
        .select()
        .single();

      if (data) {
        setReactions([...reactions, data as Reaction]);
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      {reactionTypes.map(({ type, icon: Icon, label }) => {
        const count = reactions.filter((r) => r.reaction_type === type).length;
        const hasReacted = reactions.some(
          (r) => r.user_id === currentUserId && r.reaction_type === type
        );

        return (
          <button
            key={type}
            onClick={() => toggleReaction(type)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${
              hasReacted
                ? 'bg-brand-gold/10 text-brand-gold'
                : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover'
            }`}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
