import { ref } from 'vue'

export interface EmojiItem {
  char: string
  name: string
  keywords?: string[]
}

export interface EmojiCategory {
  id: string
  name: string
  icon: string
  emojis: EmojiItem[]
}

// 1. Comprehensive Categories & Emojis
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: '😀',
    emojis: [
      { char: '😀', name: 'grinning', keywords: ['happy', 'smile'] },
      { char: '😃', name: 'smiley', keywords: ['happy', 'joy'] },
      { char: '😄', name: 'smile', keywords: ['happy', 'laugh'] },
      { char: '😁', name: 'grin', keywords: ['happy', 'teeth'] },
      { char: '😆', name: 'laughing', keywords: ['satisfied', 'haha'] },
      { char: '😅', name: 'sweat_smile', keywords: ['relief', 'nervous'] },
      { char: '😂', name: 'joy', keywords: ['tears', 'laugh', 'crying'] },
      { char: '🤣', name: 'rofl', keywords: ['rolling', 'floor', 'laughing'] },
      { char: '🥲', name: 'smiling_face_with_tear', keywords: ['tear', 'happy_cry'] },
      { char: '☺️', name: 'relaxed', keywords: ['blush', 'smile'] },
      { char: '😊', name: 'blush', keywords: ['crush', 'shy'] },
      { char: '😇', name: 'innocent', keywords: ['angel', 'halo'] },
      { char: '🙂', name: 'slightly_smiling_face', keywords: ['mild', 'okay'] },
      { char: '🙃', name: 'upside_down_face', keywords: ['sarcasm', 'silly'] },
      { char: '😉', name: 'wink', keywords: ['flirt', 'joke'] },
      { char: '😌', name: 'relieved', keywords: ['peaceful', 'calm'] },
      { char: '😍', name: 'heart_eyes', keywords: ['love', 'crush', 'adoring'] },
      { char: '🥰', name: 'smiling_face_with_3_hearts', keywords: ['love', 'in_love'] },
      { char: '😘', name: 'kissing_heart', keywords: ['kiss', 'love'] },
      { char: '😗', name: 'kissing', keywords: ['kiss'] },
      { char: '😙', name: 'kissing_smiling_eyes', keywords: ['kiss'] },
      { char: '😚', name: 'kissing_closed_eyes', keywords: ['kiss'] },
      { char: '😋', name: 'yum', keywords: ['tasty', 'delicious'] },
      { char: '😛', name: 'stuck_out_tongue', keywords: ['tongue', 'playful'] },
      { char: '😜', name: 'stuck_out_tongue_winking_eye', keywords: ['crazy', 'wink'] },
      { char: '🤪', name: 'zany_face', keywords: ['goofy', 'wild'] },
      { char: '😝', name: 'stuck_out_tongue_closed_eyes', keywords: ['prank'] },
      { char: '🤑', name: 'money_mouth_face', keywords: ['rich', 'dollar'] },
      { char: '🤗', name: 'hugs', keywords: ['hug', 'open_arms'] },
      { char: '🤭', name: 'hand_over_mouth', keywords: ['oops', 'giggle'] },
      { char: '🤫', name: 'shushing_face', keywords: ['quiet', 'secret'] },
      { char: '🤔', name: 'thinking', keywords: ['wonder', 'ponder'] },
      { char: '🤐', name: 'zipper_mouth_face', keywords: ['silent'] },
      { char: '🤨', name: 'face_with_raised_eyebrow', keywords: ['skeptical'] },
      { char: '😐', name: 'neutral_face', keywords: ['meh', 'blank'] },
      { char: '😑', name: 'expressionless', keywords: ['unimpressed'] },
      { char: '😶', name: 'no_mouth', keywords: ['speechless'] },
      { char: '😏', name: 'smirk', keywords: ['suggestive', 'cool'] },
      { char: '😒', name: 'unamused', keywords: ['bored', 'annoyed'] },
      { char: '🙄', name: 'roll_eyes', keywords: ['eyeroll', 'whatever'] },
      { char: '😬', name: 'grimacing', keywords: ['awkward', 'eek'] },
      { char: '🤥', name: 'lying_face', keywords: ['liar', 'pinocchio'] },
      { char: '😔', name: 'pensive', keywords: ['sad', 'down'] },
      { char: '😪', name: 'sleepy', keywords: ['tired'] },
      { char: '🤤', name: 'drooling_face', keywords: ['drool'] },
      { char: '😴', name: 'sleeping', keywords: ['zzz'] },
      { char: '😷', name: 'mask', keywords: ['sick', 'doctor'] },
      { char: '🤒', name: 'face_with_thermometer', keywords: ['fever'] },
      { char: '🤕', name: 'face_with_head_bandage', keywords: ['hurt', 'injury'] },
      { char: '🤢', name: 'nauseated_face', keywords: ['disgusted'] },
      { char: '🤮', name: 'vomiting_face', keywords: ['barf'] },
      { char: '🤧', name: 'sneezing_face', keywords: ['sneeze'] },
      { char: '🥵', name: 'hot_face', keywords: ['sweat', 'heat'] },
      { char: '🥶', name: 'cold_face', keywords: ['freezing'] },
      { char: '🥴', name: 'woozy_face', keywords: ['dizzy', 'drunk'] },
      { char: '😵', name: 'dizzy_face', keywords: ['knocked_out'] },
      { char: '🤯', name: 'exploding_head', keywords: ['mindblown'] },
      { char: '🤠', name: 'cowboy_hat_face', keywords: ['western'] },
      { char: '🥳', name: 'partying_face', keywords: ['party', 'celebrate'] },
      { char: '😎', name: 'sunglasses', keywords: ['cool', 'boss'] },
      { char: '🤓', name: 'nerd_face', keywords: ['geek'] },
      { char: '🧐', name: 'monocle_face', keywords: ['investigate'] },
      { char: '😕', name: 'confused', keywords: ['lost'] },
      { char: '😟', name: 'worried', keywords: ['anxious'] },
      { char: '🙁', name: 'slightly_frowning_face', keywords: ['frown'] },
      { char: '😮', name: 'open_mouth', keywords: ['wow', 'surprise'] },
      { char: '😯', name: 'hushed', keywords: ['speechless'] },
      { char: '😲', name: 'astonished', keywords: ['shocked'] },
      { char: '😳', name: 'flushed', keywords: ['embarrassed'] },
      { char: '🥺', name: 'pleading_face', keywords: ['please', 'puppy_eyes'] },
      { char: '😦', name: 'frowning', keywords: ['stunned'] },
      { char: '😧', name: 'anguished', keywords: ['distressed'] },
      { char: '😨', name: 'fearful', keywords: ['scared'] },
      { char: '😰', name: 'cold_sweat', keywords: ['nervous'] },
      { char: '😥', name: 'disappointed_relieved', keywords: ['phew'] },
      { char: '😢', name: 'cry', keywords: ['tear', 'sad'] },
      { char: '😭', name: 'sob', keywords: ['bawling', 'cry'] },
      { char: '😱', name: 'scream', keywords: ['horror', 'home_alone'] },
      { char: '😖', name: 'confounded', keywords: ['struggling'] },
      { char: '😣', name: 'persevere', keywords: ['trying'] },
      { char: '😞', name: 'disappointed', keywords: ['bummed'] },
      { char: '😓', name: 'sweat', keywords: ['hard_work'] },
      { char: '😩', name: 'weary', keywords: ['exhausted'] },
      { char: '😫', name: 'tired_face', keywords: ['overwhelmed'] },
      { char: '🥱', name: 'yawning_face', keywords: ['bored', 'tired'] },
      { char: '😤', name: 'triumph', keywords: ['steam', 'proud'] },
      { char: '😡', name: 'rage', keywords: ['pissed', 'furious'] },
      { char: '😠', name: 'angry', keywords: ['mad'] },
      { char: '🤬', name: 'cursing_face', keywords: ['swearing'] },
      { char: '😈', name: 'smiling_imp', keywords: ['devil', 'mischief'] },
      { char: '👿', name: 'imp', keywords: ['evil'] },
      { char: '💀', name: 'skull', keywords: ['dead', 'skeleton', 'dying'] },
      { char: '☠️', name: 'skull_and_crossbones', keywords: ['danger', 'poison'] },
      { char: '💩', name: 'poop', keywords: ['crap', 'turd'] },
      { char: '🤡', name: 'clown_face', keywords: ['fool', 'circus'] },
      { char: '👻', name: 'ghost', keywords: ['spooky', 'halloween'] },
      { char: '👽', name: 'alien', keywords: ['ufo'] },
      { char: '🤖', name: 'robot', keywords: ['bot'] }
    ]
  },
  {
    id: 'gestures',
    name: 'People & Gestures',
    icon: '👍',
    emojis: [
      { char: '👍', name: '+1', keywords: ['thumbsup', 'approve', 'yes', 'ok'] },
      { char: '👎', name: '-1', keywords: ['thumbsdown', 'disapprove', 'no'] },
      { char: '👏', name: 'clap', keywords: ['applause', 'bravo'] },
      { char: '🙌', name: 'raised_hands', keywords: ['celebrate', 'praise'] },
      { char: '👐', name: 'open_hands', keywords: ['open'] },
      { char: '🤲', name: 'palms_up_together', keywords: ['prayer', 'dua'] },
      { char: '🤝', name: 'handshake', keywords: ['deal', 'agreement'] },
      { char: '🙏', name: 'pray', keywords: ['please', 'thanks', 'thankyou', 'namaste'] },
      { char: '✍️', name: 'writing_hand', keywords: ['write', 'note'] },
      { char: '💅', name: 'nail_care', keywords: ['fabulous'] },
      { char: '🤳', name: 'selfie', keywords: ['photo'] },
      { char: '💪', name: 'muscle', keywords: ['strong', 'bicep', 'flex'] },
      { char: '👈', name: 'point_left', keywords: ['left'] },
      { char: '👉', name: 'point_right', keywords: ['right'] },
      { char: '👆', name: 'point_up_2', keywords: ['up', 'above'] },
      { char: '👇', name: 'point_down', keywords: ['down', 'below'] },
      { char: '☝️', name: 'point_up', keywords: ['one'] },
      { char: '✋', name: 'hand', keywords: ['stop', 'high_five'] },
      { char: '🤚', name: 'raised_back_of_hand', keywords: ['backhand'] },
      { char: '🖐️', name: 'raised_hand_with_fingers_splayed', keywords: ['five'] },
      { char: '🖖', name: 'vulcan_salute', keywords: ['spock'] },
      { char: '👋', name: 'wave', keywords: ['hello', 'bye'] },
      { char: '🤙', name: 'call_me_hand', keywords: ['shaka'] },
      { char: '👌', name: 'ok_hand', keywords: ['perfect'] },
      { char: '🤌', name: 'pinched_fingers', keywords: ['italian', 'chef'] },
      { char: '🤏', name: 'pinching_hand', keywords: ['little_bit'] },
      { char: '✌️', name: 'v', keywords: ['peace', 'victory'] },
      { char: '🤞', name: 'crossed_fingers', keywords: ['luck', 'hope'] },
      { char: '🤟', name: 'love_you_gesture', keywords: ['ily'] },
      { char: '🤘', name: 'metal', keywords: ['rock', 'horns'] },
      { char: '👊', name: 'fist', keywords: ['punch', 'bro_fist'] },
      { char: '✊', name: 'fist_raised', keywords: ['power'] },
      { char: '🤛', name: 'left_facing_fist', keywords: ['fist_bump'] },
      { char: '🤜', name: 'right_facing_fist', keywords: ['fist_bump'] },
      { char: '👀', name: 'eyes', keywords: ['look', 'see', 'peek'] },
      { char: '🧠', name: 'brain', keywords: ['smart', 'mind'] }
    ]
  },
  {
    id: 'hearts',
    name: 'Hearts & Symbols',
    icon: '❤️',
    emojis: [
      { char: '❤️', name: 'heart', keywords: ['love', 'red_heart'] },
      { char: '🧡', name: 'orange_heart', keywords: ['love'] },
      { char: '💛', name: 'yellow_heart', keywords: ['love'] },
      { char: '💚', name: 'green_heart', keywords: ['love'] },
      { char: '💙', name: 'blue_heart', keywords: ['love'] },
      { char: '💜', name: 'purple_heart', keywords: ['love'] },
      { char: '🖤', name: 'black_heart', keywords: ['love', 'dark'] },
      { char: '🤍', name: 'white_heart', keywords: ['love', 'pure'] },
      { char: '🤎', name: 'brown_heart', keywords: ['love'] },
      { char: '💔', name: 'broken_heart', keywords: ['heartbreak'] },
      { char: '❣️', name: 'heavy_heart_exclamation', keywords: ['heart'] },
      { char: '💕', name: 'two_hearts', keywords: ['love'] },
      { char: '💞', name: 'revolving_hearts', keywords: ['love'] },
      { char: '💓', name: 'heartbeat', keywords: ['beating'] },
      { char: '💗', name: 'heartpulse', keywords: ['growing'] },
      { char: '💖', name: 'sparkling_heart', keywords: ['shiny'] },
      { char: '💘', name: 'cupid', keywords: ['arrow'] },
      { char: '💝', name: 'gift_heart', keywords: ['ribbon'] },
      { char: '🔥', name: 'fire', keywords: ['lit', 'hot', 'flame'] },
      { char: '✨', name: 'sparkles', keywords: ['shine', 'magic'] },
      { char: '🌟', name: 'star2', keywords: ['glowing_star'] },
      { char: '⭐', name: 'star', keywords: ['favorite'] },
      { char: '💫', name: 'dizzy', keywords: ['star'] },
      { char: '💥', name: 'collision', keywords: ['boom', 'explode'] },
      { char: '⚡️', name: 'zap', keywords: ['lightning', 'thunder'] },
      { char: '💯', name: '100', keywords: ['perfect', 'score'] },
      { char: '✅', name: 'white_check_mark', keywords: ['done', 'yes', 'check'] },
      { char: '❌', name: 'x', keywords: ['no', 'cross'] },
      { char: '⚠️', name: 'warning', keywords: ['alert', 'caution'] },
      { char: '❓', name: 'question', keywords: ['what', 'help'] },
      { char: '❗', name: 'exclamation', keywords: ['important'] },
      { char: '💬', name: 'speech_balloon', keywords: ['chat', 'message'] },
      { char: '💤', name: 'zzz', keywords: ['sleep'] }
    ]
  },
  {
    id: 'objects',
    name: 'Celebration & Fun',
    icon: '🎉',
    emojis: [
      { char: '🎉', name: 'tada', keywords: ['party', 'celebration', 'hooray'] },
      { char: '🎊', name: 'confetti_ball', keywords: ['celebrate'] },
      { char: '🎈', name: 'balloon', keywords: ['birthday'] },
      { char: '🎁', name: 'gift', keywords: ['present'] },
      { char: '🏆', name: 'trophy', keywords: ['winner', 'champion'] },
      { char: '🥇', name: 'first_place_medal', keywords: ['gold'] },
      { char: '🥈', name: 'second_place_medal', keywords: ['silver'] },
      { char: '🥉', name: 'third_place_medal', keywords: ['bronze'] },
      { char: '👑', name: 'crown', keywords: ['king', 'queen'] },
      { char: '💎', name: 'gem', keywords: ['diamond'] },
      { char: '🚀', name: 'rocket', keywords: ['launch', 'ship', 'fast'] },
      { char: '🎯', name: 'dart', keywords: ['target', 'bullseye'] },
      { char: '🎮', name: 'video_game', keywords: ['play', 'gaming'] },
      { char: '🎲', name: 'game_die', keywords: ['dice', 'luck'] },
      { char: '🎸', name: 'guitar', keywords: ['music', 'rock'] },
      { char: '🔔', name: 'bell', keywords: ['notify', 'ring'] },
      { char: '💡', name: 'bulb', keywords: ['idea', 'light'] },
      { char: '☕', name: 'coffee', keywords: ['espresso', 'tea'] },
      { char: '🍺', name: 'beer', keywords: ['drink', 'cheers'] },
      { char: '🍻', name: 'beers', keywords: ['toast'] },
      { char: '🍕', name: 'pizza', keywords: ['food', 'cheese'] },
      { char: '🍔', name: 'hamburger', keywords: ['burger'] },
      { char: '🍟', name: 'fries', keywords: ['french_fries'] },
      { char: '🍿', name: 'popcorn', keywords: ['movie'] },
      { char: '🎂', name: 'birthday', keywords: ['cake'] }
    ]
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      { char: '🐶', name: 'dog', keywords: ['puppy', 'pet'] },
      { char: '🐱', name: 'cat', keywords: ['kitten', 'meow'] },
      { char: '🐭', name: 'mouse', keywords: ['rodent'] },
      { char: '🐰', name: 'rabbit', keywords: ['bunny'] },
      { char: '🦊', name: 'fox_face', keywords: ['fox'] },
      { char: '🐻', name: 'bear', keywords: ['grizzly'] },
      { char: '🐼', name: 'panda_face', keywords: ['panda'] },
      { char: '🐨', name: 'koala', keywords: ['australia'] },
      { char: '🐯', name: 'tiger', keywords: ['stripes'] },
      { char: '🦁', name: 'lion', keywords: ['king'] },
      { char: '🐮', name: 'cow', keywords: ['moo'] },
      { char: '🐷', name: 'pig', keywords: ['oink'] },
      { char: '🐸', name: 'frog', keywords: ['toad'] },
      { char: '🐵', name: 'monkey_face', keywords: ['ape'] },
      { char: '🙈', name: 'see_no_evil', keywords: ['shy', 'blind'] },
      { char: '🙉', name: 'hear_no_evil', keywords: ['deaf'] },
      { char: '🙊', name: 'speak_no_evil', keywords: ['mute'] },
      { char: '🐧', name: 'penguin', keywords: ['ice', 'linux'] },
      { char: '🐦', name: 'bird', keywords: ['tweet'] },
      { char: '🦆', name: 'duck', keywords: ['quack'] },
      { char: '🦉', name: 'owl', keywords: ['wise'] },
      { char: '🦄', name: 'unicorn', keywords: ['magic', 'fantasy'] },
      { char: '🐝', name: 'bee', keywords: ['honey', 'buzz'] },
      { char: '🦋', name: 'butterfly', keywords: ['wings'] },
      { char: '🌸', name: 'cherry_blossom', keywords: ['flower'] },
      { char: '🌹', name: 'rose', keywords: ['red_flower'] },
      { char: '🌻', name: 'sunflower', keywords: ['summer'] },
      { char: '🍀', name: 'four_leaf_clover', keywords: ['luck'] },
      { char: '🌲', name: 'evergreen_tree', keywords: ['pine', 'nature'] }
    ]
  }
]

// 2. Build complete bi-directional lookup maps
export const EMOJI_TO_NAME: Record<string, string> = {
  '👍': '+1',
  '👎': '-1',
  '❤️': 'heart',
  '🔥': 'fire',
  '😂': 'joy',
  '👏': 'clap',
  '😢': 'cry',
  '🎉': 'tada',
  '🚀': 'rocket',
  '😍': 'heart_eyes',
  '🤔': 'thinking',
  '🙏': 'pray',
  '🤩': 'star_struck',
  '💯': '100'
}

export const NAME_TO_EMOJI: Record<string, string> = {
  '+1': '👍',
  'thumbsup': '👍',
  '-1': '👎',
  'thumbsdown': '👎',
  'heart': '❤️',
  'fire': '🔥',
  'joy': '😂',
  'clap': '👏',
  'cry': '😢',
  'sob': '😭',
  'tada': '🎉',
  'rocket': '🚀',
  'heart_eyes': '😍',
  'thinking': '🤔',
  'pray': '🙏',
  'star_struck': '🤩',
  '100': '💯'
}

// Populate from categories
for (const cat of EMOJI_CATEGORIES) {
  for (const item of cat.emojis) {
    if (!EMOJI_TO_NAME[item.char]) {
      EMOJI_TO_NAME[item.char] = item.name
    }
    if (!NAME_TO_EMOJI[item.name]) {
      NAME_TO_EMOJI[item.name] = item.char
    }
  }
}

export function toEmojiName(emojiOrName: string): string {
  return EMOJI_TO_NAME[emojiOrName] || emojiOrName
}

export function toEmojiChar(nameOrEmoji: string): string {
  return NAME_TO_EMOJI[nameOrEmoji] || nameOrEmoji
}

// 3. Frequently Used Reactions Management
const STORAGE_KEY = 'mattergram_frequent_reactions'
export const DEFAULT_QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '👏', '😢', '🎉', '🚀']

function loadStoredReactions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = Array.from(new Set(parsed.filter((item) => typeof item === 'string' && item.trim().length > 0)))
        if (cleaned.length > 0) {
          return cleaned
        }
      }
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_QUICK_REACTIONS]
}

export const frequentReactions = ref<string[]>(loadStoredReactions())

export function recordReactionUsage(emoji: string) {
  if (!emoji) return
  const current = frequentReactions.value.filter((e) => e !== emoji)
  current.unshift(emoji)
  const updated = current.slice(0, 32)
  frequentReactions.value = updated
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}
