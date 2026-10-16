import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bypassOptions, detectChallenge } from '../src/check/blocked.ts';

const vendor = (status: number, body: string, headers: Record<string, string> = {}) => detectChallenge({ status, headers, body })?.vendor;

test('challenge and block pages are recognised by vendor', () => {
	assert.equal(vendor(403, '<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>'), 'Cloudflare');
	assert.equal(vendor(403, '', { 'cf-mitigated': 'challenge' }), 'Cloudflare');
	assert.equal(vendor(403, '<title>Access Denied</title>You don\'t have permission. Reference #18.6f3c1002.1697040000.2b1c3d', { server: 'AkamaiGHost' }), 'Akamai');
	assert.equal(vendor(403, '<script src="https://ct.captcha-delivery.com/c.js"></script>', { 'x-datadome': 'protected' }), 'DataDome');
	assert.equal(vendor(403, '<div id="px-captcha"></div><script>window._pxAppId="PXabc"</script>'), 'PerimeterX');
	assert.equal(vendor(429, '<title>One more step</title><script src="https://hcaptcha.com/1/api.js"></script>'), 'hCaptcha');
	assert.equal(vendor(403, '<title>Are you a robot?</title><div class="g-recaptcha"></div><script src="https://www.google.com/recaptcha/api.js"></script>'), 'reCAPTCHA');
	assert.equal(vendor(200, '<title>Security check</title><script src="https://www.google.com/recaptcha/api.js"></script>'), 'reCAPTCHA', 'an interstitial title is enough');
	assert.equal(vendor(403, 'Request unsuccessful. Incapsula incident ID: 123'), 'Imperva');
	assert.equal(vendor(202, '', { 'x-amzn-waf-action': 'challenge' }), 'AWS WAF');
	assert.equal(vendor(429, '<p>Our systems have detected unusual traffic from your network.</p>'), 'an unrecognised bot wall (429)');
});

test('ordinary pages, refusals and captchas inside real pages are not walls', () => {
	assert.equal(vendor(403, '<title>Forbidden</title><h1>Admins only</h1>'), undefined, 'an app 403 is compared, not stopped');
	assert.equal(vendor(429, 'Too many requests'), undefined, 'a plain rate limit is not a challenge');
	assert.equal(vendor(200, '<title>Contact</title><form><div class="g-recaptcha"></div></form><script src="https://www.google.com/recaptcha/api.js"></script>'), undefined, 'a contact form with reCAPTCHA is the app');
	assert.equal(vendor(200, '<title>Shop</title>', { server: 'AkamaiGHost', 'set-cookie': '_abck=1; Path=/' }), undefined, 'served through Akamai is not blocked by it');
	assert.equal(vendor(200, '<title>Home</title>', { server: 'cloudflare', 'cf-ray': '1-LHR' }), undefined);
});

test('--header and --cookie parse to bypass options', () => {
	assert.deepEqual(bypassOptions(['X-Staging-Pass: s3cret', 'x-other:a:b'], ['a=1; b=2', 'c=x=y']), { headers: { 'x-staging-pass': 's3cret', 'x-other': 'a:b' }, cookies: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }, { name: 'c', value: 'x=y' }] });
	assert.deepEqual(bypassOptions(), {});
	assert.throws(() => bypassOptions(['novalue']), /--header must be name:value/);
	assert.throws(() => bypassOptions([], ['bare']), /--cookie must be name=value/);
});
