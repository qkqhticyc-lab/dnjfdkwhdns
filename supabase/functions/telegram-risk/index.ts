import {makeWebhook} from '../../../telegram-risk/webhook.mjs';
Deno.serve(makeWebhook({token:Deno.env.get('TELEGRAM_BOT_TOKEN'),chatId:Deno.env.get('TELEGRAM_CHAT_ID')}));
