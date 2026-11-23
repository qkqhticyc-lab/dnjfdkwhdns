import {makeWebhook} from '../../../telegram-risk/webhook.mjs';
import {closeCache} from '../../../telegram-risk/cache.mjs';
Deno.serve(makeWebhook({token:Deno.env.get('TELEGRAM_BOT_TOKEN'),chatId:Deno.env.get('TELEGRAM_CHAT_ID'),archiveStore:closeCache({url:Deno.env.get('SUPABASE_URL'),key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')})}));
