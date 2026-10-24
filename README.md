# Rolefinder

Rolefinder is a standalone job search utility. Search public listings by role, location, skills, and remote preference; sort results by match or recency; save interesting roles in your browser; and open matching searches on LinkedIn or Indeed.

## Run locally

From PowerShell:

```powershell
Set-Location "C:\My Data\Personal\POCs\Vlog App\job-finder"
npm.cmd install
npm.cmd start
```

Open [http://localhost:3100](http://localhost:3100).

The port can be changed with the `PORT` environment variable.

## Job sources and limitations

Search results are fetched from the public APIs provided by Remotive, Arbeitnow, and Remote OK. Results are ranked and filtered locally against the supplied criteria. Listings, availability, and API access depend on each provider.

LinkedIn and Indeed do not provide unrestricted public job-search APIs for this use. Rolefinder does not scrape their pages or access accounts; it provides links that open searches on those sites instead. Applications always happen on the original job board or employer site.

Saved listings are stored in the current browser's local storage and are not uploaded to the server.
