const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

app.get('/api/jobs/search', async (req, res) => {
  const roles = parseTerms(req.query.role);
  const keywords = parseTerms(req.query.keywords);
  const location = String(req.query.location || '').trim().slice(0, 100);
  const remoteOnly = req.query.remoteOnly === 'true';

  if (!roles.length) {
    return res.status(400).json({ error: 'Enter at least one role to search for.' });
  }

  if (roles.join(' ').length > 160 || keywords.join(' ').length > 300) {
    return res.status(400).json({ error: 'Search criteria are too long.' });
  }

  const criteria = { roles, keywords, location, remoteOnly };
  const encodedSearch = encodeURIComponent([...roles, ...keywords].join(' '));
  const sources = [
    {
      name: 'Remotive',
      url: `https://remotive.com/api/remote-jobs?search=${encodedSearch}`,
      parse: (data) => Array.isArray(data.jobs) ? data.jobs.map(normalizeRemotive) : []
    },
    {
      name: 'Arbeitnow',
      url: 'https://www.arbeitnow.com/api/job-board-api?page=1',
      parse: (data) => Array.isArray(data.data) ? data.data.map(normalizeArbeitnow) : []
    },
    {
      name: 'Remote OK',
      url: 'https://remoteok.com/api',
      parse: (data) => Array.isArray(data)
        ? data.filter((item) => item && item.position).map(normalizeRemoteOk)
        : []
    }
  ];

  const settled = await Promise.allSettled(sources.map(async (source) => {
    const response = await fetch(source.url, {
      headers: { Accept: 'application/json', 'User-Agent': 'JobFinder/1.0 (public job search)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      throw new Error(`${source.name} returned HTTP ${response.status}`);
    }
    return { name: source.name, jobs: source.parse(await response.json()) };
  }));

  const available = [];
  const warnings = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      available.push(...result.value.jobs);
    } else {
      console.warn(`Job search source ${sources[index].name} failed:`, result.reason.message);
      warnings.push(`${sources[index].name} could not be reached.`);
    }
  });

  if (!available.length && warnings.length === sources.length) {
    return res.status(502).json({
      error: 'None of the job boards could be reached. Please try again later.',
      warnings
    });
  }

  const unique = new Map();
  for (const job of available) {
    if (!job.title || !job.url) continue;
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.url}`;
    if (!unique.has(key)) unique.set(key, job);
  }

  const jobs = [...unique.values()]
    .map((job) => scoreJob(job, criteria))
    .filter((job) => job.matchesRole && job.matchesKeywords && job.matchesLocation && job.matchesRemote)
    .sort((a, b) => b.matchScore - a.matchScore || Date.parse(b.date || 0) - Date.parse(a.date || 0))
    .slice(0, 100);

  res.json({
    jobs,
    total: jobs.length,
    sources: [...new Set(available.map((job) => job.source))],
    warnings
  });
});

app.listen(PORT, () => {
  console.log(`Job Finder is running at http://localhost:${PORT}`);
});

function parseTerms(value) {
  return String(value || '')
    .split(/[,\n;]/)
    .map((term) => term.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeRemotive(job) {
  return {
    title: job.title || '',
    company: job.company_name || 'Company not listed',
    location: job.candidate_required_location || 'Remote',
    description: stripHtml(job.description || ''),
    tags: Array.isArray(job.tags) ? job.tags : [],
    url: job.url || '',
    date: job.publication_date || '',
    source: 'Remotive',
    remote: true
  };
}

function normalizeArbeitnow(job) {
  return {
    title: job.title || '',
    company: job.company_name || 'Company not listed',
    location: job.location || 'Not specified',
    description: stripHtml(job.description || ''),
    tags: Array.isArray(job.tags) ? job.tags : [],
    url: job.url || '',
    date: job.created_at || '',
    source: 'Arbeitnow',
    remote: Boolean(job.remote) || /remote/i.test(`${job.location || ''} ${job.title || ''}`)
  };
}

function normalizeRemoteOk(job) {
  return {
    title: job.position || '',
    company: job.company || 'Company not listed',
    location: job.location || 'Remote',
    description: stripHtml(job.description || ''),
    tags: Array.isArray(job.tags) ? job.tags : [],
    url: job.url || (job.id ? `https://remoteok.com/remote-jobs/${job.id}` : ''),
    date: job.date || '',
    source: 'Remote OK',
    remote: true
  };
}

function stripHtml(value) {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesTerms(terms, text) {
  if (!terms.length) return true;
  const normalizedText = text.toLowerCase();
  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase();
    if (normalizedText.includes(normalizedTerm)) return true;
    const words = normalizedTerm.split(/\s+/).filter((word) => word.length > 2);
    return words.length > 0 && words.filter((word) => normalizedText.includes(word)).length / words.length >= 0.5;
  });
}

function scoreJob(job, criteria) {
  const fullText = `${job.title} ${job.company} ${job.location} ${job.tags.join(' ')} ${job.description}`.toLowerCase();
  const roleMatch = matchesTerms(criteria.roles, job.title);
  const keywordMatch = matchesTerms(criteria.keywords, fullText);
  const locationMatch = !criteria.location ||
    job.location.toLowerCase().includes(criteria.location.toLowerCase()) ||
    /remote/i.test(criteria.location) && job.remote;
  const remoteMatch = !criteria.remoteOnly || job.remote || /remote/i.test(job.location);

  const matchedRoles = criteria.roles.filter((term) => matchesTerms([term], job.title)).length;
  const matchedKeywords = criteria.keywords.filter((term) => matchesTerms([term], fullText)).length;
  const score = Math.round(
    (criteria.roles.length ? matchedRoles / criteria.roles.length * 55 : 55) +
    (criteria.keywords.length ? matchedKeywords / criteria.keywords.length * 30 : 30) +
    (criteria.location ? (locationMatch ? 15 : 0) : 15)
  );

  return {
    ...job,
    matchScore: Math.min(score, 100),
    matchesRole: roleMatch,
    matchesKeywords: keywordMatch,
    matchesLocation: locationMatch,
    matchesRemote: remoteMatch
  };
}
