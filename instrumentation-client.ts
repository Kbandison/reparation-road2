import { initBotId } from 'botid/client/core';

// Vercel BotID: attaches proof that a real browser sent requests to these form
// endpoints. Each route checks it server-side via lib/bot-protection.ts, and a
// route that checks without being listed here would treat every visitor as a
// bot, so keep the two in step.
initBotId({
  protect: [
    { path: '/api/contact', method: 'POST' },
    { path: '/api/bookings', method: 'POST' },
    { path: '/api/newsletter/subscribe', method: 'POST' },
  ],
});
