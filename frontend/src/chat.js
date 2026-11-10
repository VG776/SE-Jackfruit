'use strict';

const byId = (id) => document.getElementById(id);
const authForm = byId('auth-form');
const editor = byId('editor');
const editorForm = byId('editor-form');
const input = byId('message-input');
const composer = byId('composer');
const feed = byId('messages');
const tokenKey = 'nexuschat-session';

let token = sessionStorage.getItem(tokenKey);
let user;
let registering = false;
let communities = [];
let community;
let channels = [];
let channel;
let messages = new Map();
let socket;
let joined = false;
let retry;
let pending;
let editorMode;
let editorTarget;
let communityVersion = 0;

function feedback(element, message, success = false) {
  element.hidden = !message;
  element.textContent = message || '';
  element.classList.toggle('success', success);
}

function notice(message, success) {
  feedback(byId('notice'), message, success);
}

async function api(path, { method = 'GET', body, authenticated = true } = {}) {
  const headers = {};
  if (authenticated && token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const session = token;
  const response = await fetch('/api' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && authenticated && session === token) {
      showAuth('Your session ended. Sign in to continue.');
    }
    throw new Error(result.invalidParams?.[0]?.reason || result.detail || 'The request failed.');
  }
  return result.data;
}

function connection(label, live = false) {
  const status = byId('connection');
  status.textContent = label;
  status.classList.toggle('live', live);
}

function clearPending() {
  if (pending) clearTimeout(pending.timer);
  pending = null;
  byId('send').disabled = false;
}

function disconnect() {
  clearTimeout(retry);
  clearPending();
  const previous = socket;
  socket = null;
  joined = false;
  previous?.close();
}

function showAuth(message = '') {
  disconnect();
  communityVersion += 1;
  token = null;
  user = null;
  communities = [];
  community = null;
  channels = [];
  channel = null;
  messages = new Map();
  sessionStorage.removeItem(tokenKey);
  if (editor.open) editor.close();
  byId('workspace').hidden = true;
  byId('auth-screen').hidden = false;
  authForm.reset();
  setAuthMode(false);
  feedback(byId('auth-error'), message);
}

function setAuthMode(create) {
  registering = create;
  byId('auth-title').textContent = create ? 'Create your account' : 'Welcome back';
  byId('auth-copy').textContent = create ? 'Join NexusChat to start your workspace.' : 'Sign in to open your communities.';
  byId('auth-submit').textContent = create ? 'Create account' : 'Sign in';
  byId('auth-prompt').textContent = create ? 'Already registered?' : 'New to NexusChat?';
  byId('auth-toggle').textContent = create ? 'Sign in' : 'Create an account';
  byId('email-field').hidden = !create;
  authForm.elements.email.required = create;
  authForm.elements.username.maxLength = create ? 30 : 254;
  authForm.elements.password.minLength = create ? 8 : 0;
  authForm.elements.password.autocomplete = create ? 'new-password' : 'current-password';
  feedback(byId('auth-error'), '');
}

async function signIn(username, password) {
  const result = await api('/auth/login', {
    method: 'POST', authenticated: false, body: { username, password },
  });
  token = result.token;
  sessionStorage.setItem(tokenKey, token);
  await enterWorkspace(result.user);
}

async function enterWorkspace(profile) {
  user = profile;
  byId('profile-name').textContent = profile.username;
  byId('profile-avatar').textContent = profile.username.slice(0, 1).toUpperCase();
  byId('auth-screen').hidden = true;
  byId('workspace').hidden = false;
  notice('');
  renderNavigation();
  renderMessages();
  const session = token;
  try {
    const result = await api('/communities');
    if (session !== token) return;
    communities = result;
    renderNavigation();
    if (communities.length) await selectCommunity(communities[0]);
  } catch (error) {
    notice(error.message);
  }
}

function navigationButton(item, selected, icon, select) {
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.setAttribute('aria-current', String(item.id === selected?.id));
  const symbol = document.createElement('span');
  symbol.className = 'nav-icon';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = icon;
  const name = document.createElement('span');
  name.textContent = item.name;
  button.append(symbol, name);
  button.addEventListener('click', select);
  return button;
}

function renderNavigation() {
  byId('communities').replaceChildren(...communities.map((item) =>
    navigationButton(item, community, item.name[0].toUpperCase(), () => selectCommunity(item))));
  byId('channels').replaceChildren(...channels.map((item) =>
    navigationButton(item, channel, '#', () => selectChannel(item))));
  if (community && !channels.length) {
    const empty = document.createElement('div');
    empty.className = 'sidebar-empty';
    empty.textContent = 'No text channels yet';
    byId('channels').append(empty);
  }
  const admin = community?.role === 'admin';
  byId('new-channel').disabled = !admin;
  byId('new-channel').title = admin ? 'Create channel' : 'Only community admins can create channels';
  byId('channel-settings').disabled = !admin || !channel;
  byId('channel-settings').title = admin ? 'Manage this channel' : 'Only community admins can manage channels';
  byId('community-name').textContent = community?.name || 'WORKSPACE';
  byId('channel-name').textContent = channel?.name || (community ? 'Choose a channel' : 'Create a community');
  byId('profile-role').textContent = community ? (admin ? 'Community admin' : 'Community ' + community.role) : 'Signed in';
  composer.hidden = !channel;
  input.placeholder = channel ? 'Message #' + channel.name : 'Write a message';
}

async function selectCommunity(item) {
  const version = ++communityVersion;
  community = item;
  channels = [];
  selectChannel(null);
  try {
    const result = await api('/communities/' + item.id + '/channels');
    if (version !== communityVersion) return;
    channels = result;
    selectChannel(channels[0] || null);
  } catch (error) {
    if (version === communityVersion) notice(error.message);
  }
}

function renderMessages() {
  if (!messages.size) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const icon = document.createElement('span');
    icon.className = 'channel-icon';
    icon.textContent = '#';
    const title = document.createElement('strong');
    title.textContent = channel ? 'Start the conversation' : community ? 'No channel selected' : 'Your workspace starts here';
    const description = document.createElement('p');
    description.textContent = channel ? 'Send the first message in #' + channel.name + '.' :
      community ? 'Choose a text channel from the sidebar.' : 'Create a community to make a space for your team.';
    empty.append(icon, title, description);
    feed.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  const ordered = [...messages.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  for (const message of ordered) {
    const own = message.senderId === user?.id;
    const article = document.createElement('article');
    article.className = own ? 'message own' : 'message';
    const copy = document.createElement('div');
    copy.className = 'message-copy';
    const name = document.createElement('strong');
    name.textContent = own ? 'You' : 'Community member';
    const body = document.createElement('p');
    body.textContent = message.content;
    const sentAt = new Date(message.createdAt);
    const time = document.createElement('time');
    time.dateTime = message.createdAt;
    time.textContent = sentAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    time.title = sentAt.toLocaleString([], { dateStyle: 'full', timeStyle: 'long' });
    copy.append(name, body, time);
    article.append(copy);
    fragment.append(article);
  }
  feed.replaceChildren(fragment);
  feed.scrollTop = feed.scrollHeight;
}

async function readHistory(id, view) {
  try {
    const result = await api('/channels/' + id + '/messages');
    if (messages !== view) return;
    for (const message of result.messages) view.set(message.id, message);
    renderMessages();
  } catch (error) {
    if (messages === view) notice(error.message);
  }
}

function selectChannel(item) {
  disconnect();
  channel = item;
  messages = new Map();
  input.value = '';
  notice('');
  renderNavigation();
  renderMessages();
  if (!channel) {
    connection('No channel');
    return;
  }
  readHistory(channel.id, messages);
  connect(channel.id, messages);
}

function connect(id, view) {
  if (!token || messages !== view) return;
  connection('Connecting');
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const current = new WebSocket(scheme + '//' + location.host + '/api/ws', ['nexuschat.v1', 'bearer.' + token]);
  socket = current;
  current.addEventListener('open', () => {
    if (socket !== current) return;
    current.send(JSON.stringify({ type: 'JOIN_CHANNEL', payload: { channelId: id } }));
  });
  current.addEventListener('message', ({ data }) => {
    if (socket !== current) return;
    const event = JSON.parse(data);
    if (event.type === 'ACK' && event.event === 'JOIN_CHANNEL') {
      joined = true;
      connection('Live', true);
      readHistory(id, view);
    }
    if (event.type === 'MESSAGE_CREATED' && event.payload.channelId === id) {
      view.set(event.payload.id, event.payload);
      renderMessages();
    }
    if (event.type === 'ACK' && event.event === 'SEND_MESSAGE' && pending && event.payload.clientNonce === pending.nonce) {
      if (input.value.trim() === pending.content) input.value = '';
      clearPending();
      input.focus();
    }
    if (event.type === 'ERROR') {
      clearPending();
      if (!joined) connection('Unavailable');
      notice(event.detail);
    }
  });
  current.addEventListener('close', () => {
    if (socket !== current) return;
    joined = false;
    if (pending) notice('Connection dropped while sending. Check the history before retrying.');
    clearPending();
    connection('Reconnecting');
    retry = setTimeout(() => connect(id, view), 1500);
  });
}

function openEditor(mode) {
  editorMode = mode;
  editorTarget = mode === 'community' ? null : mode === 'channel' ? community : channel;
  editorForm.reset();
  feedback(byId('editor-error'), '');
  byId('editor-title').textContent = {
    community: 'Create a community', channel: 'Create a text channel',
    rename: 'Channel settings', delete: 'Delete #' + (channel?.name || ''),
  }[mode];
  byId('editor-name-field').hidden = mode === 'delete';
  byId('editor-name').required = mode !== 'delete';
  byId('editor-name').minLength = mode === 'community' ? 2 : 1;
  byId('editor-name').value = mode === 'rename' ? editorTarget.name : '';
  byId('editor-description-field').hidden = mode !== 'community';
  byId('delete-channel').hidden = mode !== 'rename';
  byId('editor-copy').hidden = mode !== 'delete';
  byId('editor-copy').textContent = 'This permanently removes the channel and its messages.';
  const save = byId('save-editor');
  save.disabled = false;
  save.textContent = { community: 'Create community', channel: 'Create channel', rename: 'Save name', delete: 'Delete channel' }[mode];
  save.classList.toggle('danger-button', mode === 'delete');
  if (!editor.open) editor.showModal();
  if (mode === 'delete') byId('cancel-editor').focus();
  else byId('editor-name').focus();
}

editorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const save = byId('save-editor');
  if (save.disabled) return;
  save.disabled = true;
  const mode = editorMode;
  const target = editorTarget;
  const name = editorForm.elements.name.value.trim();
  const session = token;
  try {
    if (mode === 'community') {
      const description = editorForm.elements.description.value.trim();
      const created = await api('/communities', { method: 'POST', body: { name, description } });
      if (session !== token) return;
      communities.push({ ...created, role: 'admin' });
      await selectCommunity(communities.at(-1));
      notice('Community created.', true);
    } else if (mode === 'channel') {
      const created = await api('/communities/' + target.id + '/channels', { method: 'POST', body: { name, type: 'text' } });
      if (session !== token) return;
      channels.push(created);
      selectChannel(created);
      notice('Channel created.', true);
    } else if (mode === 'rename') {
      const renamed = await api('/channels/' + target.id, { method: 'PATCH', body: { name } });
      if (session !== token) return;
      channels = channels.map((item) => item.id === renamed.id ? renamed : item);
      channel = renamed;
      renderNavigation();
      notice('Channel renamed.', true);
    } else {
      await api('/channels/' + target.id + '?confirm=true', { method: 'DELETE' });
      if (session !== token) return;
      channels = channels.filter((item) => item.id !== target.id);
      selectChannel(channels[0] || null);
      notice('Channel deleted.', true);
    }
    editor.close();
  } catch (error) {
    feedback(byId('editor-error'), error.message);
  } finally {
    save.disabled = false;
  }
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || !channel || pending || byId('send').disabled) return;
  notice('');
  if (joined && socket?.readyState === WebSocket.OPEN) {
    const nonce = crypto.randomUUID();
    pending = { content, nonce, timer: setTimeout(() => {
      clearPending();
      readHistory(channel.id, messages);
      notice('Delivery was not confirmed. Check the history before retrying.');
    }, 8000) };
    byId('send').disabled = true;
    socket.send(JSON.stringify({ type: 'SEND_MESSAGE', payload: { channelId: channel.id, content, clientNonce: nonce } }));
    return;
  }
  const view = messages;
  byId('send').disabled = true;
  try {
    const message = await api('/channels/' + channel.id + '/messages', { method: 'POST', body: { content } });
    if (messages === view) {
      view.set(message.id, message);
      if (input.value.trim() === content) input.value = '';
      renderMessages();
    }
  } catch (error) {
    if (messages === view) notice(error.message);
  } finally {
    if (messages === view) byId('send').disabled = false;
  }
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId('auth-submit');
  if (button.disabled) return;
  button.disabled = true;
  feedback(byId('auth-error'), '');
  const { username, email, password } = Object.fromEntries(new FormData(authForm));
  try {
    if (registering) {
      await api('/auth/register', { method: 'POST', authenticated: false, body: { username, email, password } });
    }
    await signIn(username, password);
  } catch (error) {
    feedback(byId('auth-error'), error.message);
  } finally {
    button.disabled = false;
  }
});

byId('auth-toggle').addEventListener('click', () => setAuthMode(!registering));
byId('new-community').addEventListener('click', () => openEditor('community'));
byId('new-channel').addEventListener('click', () => openEditor('channel'));
byId('channel-settings').addEventListener('click', () => openEditor('rename'));
byId('delete-channel').addEventListener('click', () => openEditor('delete'));
byId('cancel-editor').addEventListener('click', () => editor.close());
byId('logout').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    showAuth();
  } catch (error) {
    notice(error.message);
  }
});

byId('demo-accounts').hidden = new URLSearchParams(location.search).get('demo') !== '1';
document.querySelectorAll('[data-demo-user]').forEach((button) => {
  button.addEventListener('click', () => {
    setAuthMode(false);
    authForm.elements.username.value = button.dataset.demoUser;
    authForm.elements.password.value = 'NexusDemo2026!';
    authForm.requestSubmit();
  });
});

setAuthMode(false);
if (token) {
  api('/users/me').then(enterWorkspace).catch((error) => showAuth(error.message));
}
