import axios from 'axios';
import cfonts from 'cfonts';
import gradient from 'gradient-string';
import chalk from 'chalk';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import ProgressBar from 'progress';
import ora from 'ora';

const logger = {
  info: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || 'ℹ️  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.green('INFO');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  warn: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '⚠️ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.yellow('WARN');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  error: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '❌ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.red('ERROR');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  }
};

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function centerText(text, width) {
  const cleanText = stripAnsi(text);
  const textLength = cleanText.length;
  const totalPadding = Math.max(0, width - textLength);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function printHeader(title) {
  const width = 80;
  console.log(gradient.morning(`┬${'─'.repeat(width - 2)}┬`));
  console.log(gradient.morning(`│ ${title.padEnd(width - 4)} │`));
  console.log(gradient.morning(`┴${'─'.repeat(width - 2)}┴`));
}

function printInfo(label, value, context) {
  logger.info(`${label.padEnd(15)}: ${chalk.cyan(value)}`, { emoji: '📍 ', context });
}

async function formatTaskTable(tasks, context) {
  console.log('\n');
  logger.info('Task List:', { context, emoji: '📋 ' });
  console.log('\n');

  const spinner = ora('Rendering tasks...').start();
  await new Promise(resolve => setTimeout(resolve, 1000));
  spinner.stop();

  const header = chalk.cyanBright('+----------------------+----------+-------+---------+\n| Task Name            | Category | Point | Status  |\n+----------------------+----------+-------+---------+');
  const rows = tasks.map(task => {
    const displayName = task.description && typeof task.description === 'string'
      ? (task.description.length > 20 ? task.description.slice(0, 17) + '...' : task.description)
      : 'Unknown Task';
    const category = ((task.category || 'N/A') + '     ').slice(0, 8);
    const points = ((task.credits_reward || 0).toString() + '    ').slice(0, 5);
    const status = task.status === 'completed' ? chalk.greenBright('Complte') : chalk.yellowBright('Pending');
    return `| ${displayName.padEnd(20)} | ${category} | ${points} | ${status.padEnd(6)} |`;
  }).join('\n');
  const footer = chalk.cyanBright('+----------------------+----------+-------+---------+');

  console.log(header + '\n' + rows + '\n' + footer);
  console.log('\n');
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/102.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getGlobalHeaders(token) {
  return {
    'accept': 'application/json',
    'authorization': `Bearer ${token}`,
    'cache-control': 'no-cache',
    'origin': 'https://api.cryptal.ai',
    'referer': 'https://api.cryptal.ai/',
    'user-agent': getRandomUserAgent()
  };
}

function getStandardHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json'
  };
}

function getAxiosConfig(proxy, token = null, useGlobalHeaders = true) {
  const config = {
    headers: useGlobalHeaders ? getGlobalHeaders(token) : getStandardHeaders(),
    timeout: 60000
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
}

function newAgent(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
    return new SocksProxyAgent(proxy);
  } else {
    logger.warn(`Unsupported proxy: ${proxy}`);
    return null;
  }
}

async function requestWithRetry(method, url, payload = null, config = {}, retries = 3, backoff = 2000, context) {
  for (let i = 0; i < retries; i++) {
    try {
      let response;
      if (method.toLowerCase() === 'get') {
        response = await axios.get(url, config);
      } else if (method.toLowerCase() === 'post') {
        response = await axios.post(url, payload, config);
      } else {
        throw new Error(`Method ${method} not supported`);
      }
      return { success: true, response: response.data };
    } catch (error) {
      if (i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries})`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      logger.error(`Request failed: ${error.message} - Status: ${error.response?.status}`, { context });
      if (error.response?.status === 404) {
        return { success: false, message: 'Task endpoint not found', status: 404 };
      }
      return { success: false, message: error.message, status: error.response?.status };
    }
  }
}

async function readTokens() {
  try {
    const data = await fs.readFile('tokenku.txt', 'utf-8');
    const tokens = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    logger.info(`Loaded ${tokens.length} token${tokens.length === 1 ? '' : 's'}`, { emoji: '📄 ' });
    return tokens;
  } catch (error) {
    logger.error(`Failed to read tokenku.txt: ${error.message}`, { emoji: '❌ ' });
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      logger.warn('No proxies found. Proceeding without proxy.', { emoji: '⚠️ ' });
    } else {
      logger.info(`Loaded ${proxies.length} prox${proxies.length === 1 ? 'y' : 'ies'}`, { emoji: '🌐 ' });
    }
    return proxies;
  } catch (error) {
    logger.warn('proxy.txt not found.', { emoji: '⚠️ ' });
    return [];
  }
}

async function getPublicIP(proxy, context) {
  try {
    const response = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, getAxiosConfig(proxy, null, false), 3, 2000, context);
    return response.response.ip || 'Unknown';
  } catch (error) {
    logger.error(`Failed to get IP: ${error.message}`, { emoji: '❌ ', context });
    return 'Error retrieving IP';
  }
}

async function fetchUserInfo(token, proxy, context) {
  const spinner = ora({ text: 'Fetching user info...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/auth/social-profiles', null, getAxiosConfig(proxy, token), 3, 2000, context);
    if (!response.success || !response.response || !response.response.response || !Array.isArray(response.response.response) || response.response.response.length === 0) {
      logger.warn('No social profiles found, proceeding with token identifier', { context });
      spinner.warn('No social profiles found');
      return { username: `Token_${token.slice(0, 8)}...` };
    }
    const username = response.response.response[0].display_name || `Token_${token.slice(0, 8)}...`;
    spinner.stop();
    return { username };
  } catch (error) {
    spinner.fail(` Failed to fetch user: ${error.message}`);
    return { username: `Token_${token.slice(0, 8)}...` };
  }
}

async function fetchTasks(token, proxy, context) {
  try {
    const allTasksResponse = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks?take=100&skip=0', null, getAxiosConfig(proxy, token), 3, 2000, context);
    if (!allTasksResponse.success || !allTasksResponse.response || !allTasksResponse.response.response || !allTasksResponse.response.response.data) {
      throw new Error('Failed to fetch full task list');
    }
    const allTasks = allTasksResponse.response.response.data;
    const userAvailableResponse = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/user-available?take=100&skip=0', null, getAxiosConfig(proxy, token), 3, 2000, context);
    if (!userAvailableResponse.success || !userAvailableResponse.response || !userAvailableResponse.response.response || !userAvailableResponse.response.response.data) {
      throw new Error('Failed to fetch user-available tasks');
    }
    const userAvailableTasks = userAvailableResponse.response.response.data.map(task => task.id);
    const tasks = allTasks
      .filter(task => task.task_type !== 'invite_friend' && task.task_type !== 'share_post')
      .map(task => ({
        id: task.id,
        name: task.task_name,
        description: task.task_description,
        category: task.task_type,
        credits_reward: task.credits_reward,
        is_daily: task.is_daily,
        is_one_time: task.is_one_time,
        status: userAvailableTasks.includes(task.id) ? 'pending' : 'completed'
      }));

    return tasks;
  } catch (error) {
    logger.error(`Failed to fetch tasks: ${error.message} - Status: ${error.status || 'N/A'}`, { context });
    return { error: `Failed: ${error.message}` };
  }
}

async function completeTask(token, task, proxy, context) {
  const taskContext = `${context}|T${task.id.slice(-6)}`;
  const spinner = ora({ text: `Verifying ${task.name}...`, spinner: 'dots' }).start();
  try {
    let response;
    switch (task.category) {
      case 'daily_login':
        response = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/daily-login', null, getAxiosConfig(proxy, token), 3, 2000, taskContext);
        break;
      case 'follow_cryptal':
        response = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/follow-cryptal', null, getAxiosConfig(proxy, token), 3, 2000, taskContext);
        break;
      case 'join_discord':
        response = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/follow-discord', null, getAxiosConfig(proxy, token), 3, 2000, taskContext);
        break;
      case 'join_waitlist':
        const email = `user${Math.floor(Math.random() * 10000)}@gmail.com`;
        const payloadWaitlist = { email, first_name: '' };
        response = await requestWithRetry('post', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/waitlist', payloadWaitlist, getAxiosConfig(proxy, token), 3, 2000, taskContext);
        break;
      case 'submit_feedback':
        const feedbacks = ['Great platform!', 'Love the features!', 'Very user-friendly.', 'Excellent service!'];
        const feedback = feedbacks[Math.floor(Math.random() * feedbacks.length)];
        const payloadFeedback = { feedback };
        response = await requestWithRetry('post', 'https://api.cryptal.ai/apis/v2/vibe-credit/tasks/feedback', payloadFeedback, getAxiosConfig(proxy, token), 3, 2000, taskContext);
        break;
      default:
        spinner.warn(`Skipped: ${task.name} [Category: ${task.category}] - Task not supported`);
        return { success: false, message: `Skipped: ${task.category} not supported` };
    }
    if (response.success) {
      if (response.response?.success || response.response?.message?.includes('already completed')) {
        spinner.succeed(chalk.bold.greenBright(` Verified: ${task.name} [Category: ${task.category}]`));
        return { success: true, message: `Task "${task.name}" completed or already completed` };
      } else {
        spinner.warn(`Failed to verify ${task.name}: ${response.response?.message || 'Unknown error'} [Category: ${task.category}]`);
        return { success: false, message: `Failed: ${response.response?.message || 'Unknown error'}` };
      }
    } else if (response.status === 404) {
      spinner.warn(`Skipped: ${task.name} [Category: ${task.category}] - Task endpoint not found`);
      return { success: false, message: `Skipped: Task endpoint not found` };
    } else {
      spinner.warn(`Failed to verify ${task.name}: ${response.message || 'Unknown error'} [Category: ${task.category}]`);
      return { success: false, message: `Failed: ${response.message || 'Unknown error'}` };
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to verify ${task.name}: ${error.message} [Category: ${task.category}]`));
    return { success: false, message: `Failed to verify: ${error.message}` };
  }
}

async function fetchStatistics(token, proxy, context) {
  const spinner = ora({ text: 'Fetching statistics...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', 'https://api.cryptal.ai/apis/v2/vibe-credit', null, getAxiosConfig(proxy, token), 3, 2000, context);
    if (!response.success || !response.response || !response.response.response) {
      throw new Error('Failed to fetch statistics');
    }
    const data = response.response.response;
    spinner.stop();
    return {
      totalCredits: data.total_credits || 'N/A',
      leaderboardRank: data.leaderboard_rank || 'N/A'
    };
  } catch (error) {
    spinner.fail(` Failed to fetch stats: ${error.message}`);
    return { error: `Failed: ${error.message}` };
  }
}

async function processAccount(token, index, total, proxy = null) {
  const context = `Account ${index + 1}/${total}`;
  logger.info(chalk.bold.magentaBright(`Starting account processing`), { emoji: '🚀 ', context });

  printHeader(`Account Info ${context}`);
  const userInfo = await fetchUserInfo(token, proxy, context);
  const ip = await getPublicIP(proxy, context);
  printInfo('Username', userInfo.username, context);
  printInfo('IP', ip, context);
  console.log('\n');

  const tasks = await fetchTasks(token, proxy, context);
  if (tasks.error) {
    logger.error(`Skipping account due to tasks error: ${tasks.error}`, { context });
    return;
  }

  if (tasks.length === 0) {
    logger.info('No tasks available', { emoji: '⚠️ ', context });
  } else {
    const bar = new ProgressBar('Processing [:bar] :percent :etas', {
      complete: '█',
      incomplete: '░',
      width: 30,
      total: tasks.length
    });
    let completedTasks = 0;
    let skippedTasks = 0;

    for (const task of tasks) {
      try {
        if (task.status === 'pending') {
          const result = await completeTask(token, task, proxy, context);
          if (result.success) {
            task.status = 'completed';
            completedTasks++;
          } else if (result.message.includes('Skipped')) {
            skippedTasks++;
          }
        }
      } catch (error) {
        logger.error(`Error processing task ${task.id}: ${error.message}`, { context });
      }
      bar.tick();
      await delay(2);
    }
    await formatTaskTable(tasks, context);
    logger.info(`Processed ${tasks.length} tasks: ${completedTasks} completed, ${skippedTasks} skipped`, { emoji: '📊', context });
  }

  printHeader(`Account Stats ${context}`);
  const stats = await fetchStatistics(token, proxy, context);
  if (stats.error) {
    logger.error(`Skipping stats due to error: ${stats.error}`, { context });
    return;
  }
  printInfo('Total Credits', stats.totalCredits, context);
  printInfo('Leaderboard Rank', stats.leaderboardRank, context);

  logger.info(chalk.bold.greenBright(`Completed account processing`), { emoji: '🎉 ', context });
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

let globalUseProxy = false;
let globalProxies = [];

async function initializeConfig() {
  const useProxyAns = await askQuestion(chalk.cyanBright('🔌 Dp You Want Use Proxy? (y/n): '));
  if (useProxyAns.trim().toLowerCase() === 'y') {
    globalUseProxy = true;
    globalProxies = await readProxies();
    if (globalProxies.length === 0) {
      globalUseProxy = false;
      logger.warn('No proxies available, proceeding without proxy.', { emoji: '⚠️ ' });
    }
  } else {
    logger.info('Proceeding without proxy.', { emoji: 'ℹ️ ' });
  }
}

async function runCycle() {
  const tokens = await readTokens();
  if (tokens.length === 0) {
    logger.error('No tokens found in tokenku.txt. Exiting cycle.', { emoji: '❌ ' });
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const proxy = globalUseProxy ? globalProxies[i % globalProxies.length] : null;
    try {
      await processAccount(tokens[i], i, tokens.length, proxy);
    } catch (error) {
      logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context: `Account ${i + 1}/${tokens.length}` });
    }
    if (i < tokens.length - 1) {
      console.log('\n\n');
    }
    await delay(5);
  }
}

async function run() {
  const terminalWidth = process.stdout.columns || 80;
  cfonts.say('ANNISA', {
    font: 'block',
    align: 'center',
    colors: ['yellow', 'green', 'cyan', 'blue', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true
  });
  console.log(gradient.retro(centerText('=== GA ADA KOPINYA MALES 🚀 : TG: @annisaazzahra123 ===', terminalWidth)));
  console.log(gradient.retro(centerText('✪ CRYPTAL VIBE AUTO DAILY TASKS ✪', terminalWidth)));
  console.log('\n');
  await initializeConfig();

  while (true) {
    await runCycle();
    logger.info(chalk.bold.yellowBright('Cycle completed. Waiting 24 hours...'), { emoji: '🔄 ' });
    await delay(86400);
  }
}

run().catch(error => logger.error(`Fatal error: ${error.message}`, { emoji: '❌' }));
