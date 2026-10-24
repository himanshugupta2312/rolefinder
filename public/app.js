const form = document.querySelector('#searchForm');
const roleInput = document.querySelector('#role');
const resultsList = document.querySelector('#resultsList');
const savedList = document.querySelector('#savedList');
const resultsTitle = document.querySelector('#resultsTitle');
const sortWrap = document.querySelector('#sortWrap');
const sortSelect = document.querySelector('#sortSelect');
const searchLinks = document.querySelector('#searchLinks');
const warningList = document.querySelector('#warningList');
const quickSearches = document.querySelector('#quickSearches');
const savedCount = document.querySelector('#savedCount');
const savedHeadingCount = document.querySelector('#savedHeadingCount');
const searchButton = form.querySelector('button[type="submit"]');

let currentJobs = [];
let currentCriteria = null;

function readSavedJobs() {
  try {
    const saved = JSON.parse(localStorage.getItem('rolefinder-saved') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error('Could not read saved jobs from this browser.', error);
    return [];
  }
}

function writeSavedJobs(jobs) {
  try {
    localStorage.setItem('rolefinder-saved', JSON.stringify(jobs));
    renderSavedJobs();
    return true;
  } catch (error) {
    console.error('Could not save jobs in this browser.', error);
    warningList.innerHTML = '<p>Your browser could not save this job. Check your browser storage settings and try again.</p>';
    return false;
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function jobCard(job, saved) {
  const savedJobs = readSavedJobs();
  const isSaved = savedJobs.some((item) => item.url === job.url);
  const description = job.description || 'Open the original posting to learn more about this role.';
  const tags = Array.isArray(job.tags) ? job.tags.slice(0, 4) : [];
  const date = formatDate(job.date);
  return `<article class="job-card">
    <div class="job-topline"><div class="company-wrap"><span class="company-mark">${escapeHtml((job.company || '?').slice(0, 1))}</span><span class="company-name">${escapeHtml(job.company)}</span></div>
      ${saved ? '' : `<span class="match-pill">${Number(job.matchScore) || 0}% match</span>`}</div>
    <h3 class="job-title">${escapeHtml(job.title)}</h3>
    <div class="job-meta"><span>⌖ ${escapeHtml(job.location || 'Location not listed')}</span>${date ? `<span>◷ ${escapeHtml(date)}</span>` : ''}${job.remote ? '<span>↗ Remote-friendly</span>' : ''}</div>
    <p class="job-description">${escapeHtml(description)}</p>
    <div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
    <div class="job-bottom"><span class="job-source">${escapeHtml(job.source || 'Saved job')}</span>
      <div class="job-actions">
        <button type="button" class="save-button" data-url="${escapeHtml(job.url)}" aria-label="${isSaved ? 'Remove saved job' : 'Save job'}">${isSaved ? '♥ Saved' : '♡ Save'}</button>
        <a class="apply-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">View role ↗</a>
      </div>
    </div>
  </article>`;
}

function renderSavedJobs() {
  const jobs = readSavedJobs();
  savedCount.textContent = String(jobs.length);
  savedHeadingCount.textContent = String(jobs.length);
  savedList.innerHTML = jobs.length
    ? jobs.map((job) => jobCard(job, true)).join('')
    : '<div class="empty-state"><strong>No saved jobs yet</strong>Tap “Save” on a role you want to come back to.</div>';
}

function renderResults() {
  const jobs = [...currentJobs];
  if (sortSelect.value === 'newest') {
    jobs.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  } else {
    jobs.sort((a, b) => b.matchScore - a.matchScore);
  }
  resultsList.innerHTML = jobs.length
    ? jobs.map((job) => jobCard(job, false)).join('')
    : '<div class="empty-state"><strong>No close matches found</strong>Try a broader role title, fewer keywords, or a different location.</div>';
}

function renderSearchLinks(criteria) {
  const q = encodeURIComponent([criteria.roles, criteria.location, criteria.keywords].filter(Boolean).join(' '));
  const linkedinQuery = encodeURIComponent([criteria.roles, criteria.location, criteria.keywords].filter(Boolean).join(' '));
  searchLinks.innerHTML = `<span>Broaden your search on</span>
    <a href="https://www.linkedin.com/jobs/search/?keywords=${linkedinQuery}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
    <a href="https://www.indeed.com/jobs?q=${q}" target="_blank" rel="noopener noreferrer">Indeed ↗</a>`;
  searchLinks.classList.remove('hidden');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const criteria = {
    roles: roleInput.value.trim(),
    location: document.querySelector('#location').value.trim(),
    keywords: document.querySelector('#keywords').value.trim(),
    remoteOnly: document.querySelector('#remoteOnly').checked
  };
  if (!criteria.roles) {
    roleInput.focus();
    return;
  }

  currentCriteria = criteria;
  quickSearches.classList.add('hidden');
  sortWrap.classList.add('hidden');
  warningList.innerHTML = '';
  searchButton.disabled = true;
  searchButton.querySelector('span:first-child').textContent = 'Searching public job boards…';
  resultsTitle.textContent = 'Finding your matches';
  resultsList.innerHTML = '<div class="empty-state"><strong>Looking across job boards</strong>Gathering current public listings and matching them to your criteria.</div>';

  const params = new URLSearchParams({
    role: criteria.roles,
    location: criteria.location,
    keywords: criteria.keywords,
    remoteOnly: String(criteria.remoteOnly)
  });
  try {
    const response = await fetch(`/api/jobs/search?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The search could not be completed.');
    currentJobs = result.jobs;
    resultsTitle.textContent = `${result.total} ${result.total === 1 ? 'role' : 'roles'} to explore`;
    sortWrap.classList.remove('hidden');
    renderSearchLinks(criteria);
    warningList.innerHTML = result.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join('');
    renderResults();
  } catch (error) {
    currentJobs = [];
    resultsTitle.textContent = 'Search unavailable';
    resultsList.innerHTML = `<div class="empty-state"><strong>We couldn’t complete that search</strong>${escapeHtml(error.message)} Please try again in a moment.</div>`;
    console.error('Job search failed:', error);
  } finally {
    searchButton.disabled = false;
    searchButton.querySelector('span:first-child').textContent = 'Find my matches';
  }
});

quickSearches.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-role]');
  if (!button) return;
  roleInput.value = button.dataset.role;
  form.requestSubmit();
});

sortSelect.addEventListener('change', renderResults);

document.addEventListener('click', (event) => {
  const button = event.target.closest('.save-button');
  if (!button) return;
  const savedJobs = readSavedJobs();
  const isSaved = savedJobs.some((job) => job.url === button.dataset.url);
  const job = [...currentJobs, ...savedJobs].find((item) => item.url === button.dataset.url);
  if (!job) return;
  const nextJobs = isSaved
    ? savedJobs.filter((item) => item.url !== button.dataset.url)
    : [job, ...savedJobs];
  if (!writeSavedJobs(nextJobs)) return;
  if (currentCriteria) renderResults();
});

renderSavedJobs();
