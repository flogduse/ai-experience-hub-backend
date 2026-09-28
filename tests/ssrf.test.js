import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp } from '../src/controllers/admin.controller.js';

// Guards the SSRF protection in the link-health probe. A regression here means
// a creator-supplied project URL could reach the cloud metadata service
// (169.254.169.254), a local admin panel, or another host on the private network.
//
// The rule: if the server refuses to fetch it, the host should be logged as
// rejected. If the server *would* fetch it, it must be a public address.
// Everything in MUST_BLOCK must return false; everything in MUST_ALLOW must
// return true. A false positive in MUST_ALLOW breaks a feature that works
// today, so treat those as failures too.

const MUST_BLOCK = [
  // --- IPv4 ---
  ['0.0.0.0', 'this-network'],
  ['10.1.2.3', 'private 10/8'],
  ['100.64.0.1', 'CGNAT 100.64/10'],
  ['100.127.255.255', 'CGNAT upper bound'],
  ['127.0.0.1', 'loopback'],
  ['127.255.255.254', 'loopback range'],
  ['169.254.169.254', 'AWS/GCP/Azure metadata service'],
  ['172.16.0.1', 'private 172.16/12 lower'],
  ['172.31.255.255', 'private 172.16/12 upper'],
  ['192.0.0.1', 'IETF protocol assignments'],
  ['192.0.2.1', 'TEST-NET-1'],
  ['192.168.1.1', 'private 192.168/16'],
  ['198.18.0.1', 'benchmarking 198.18/15'],
  ['198.51.100.1', 'TEST-NET-2'],
  ['203.0.113.1', 'TEST-NET-3'],
  ['224.0.0.1', 'multicast'],
  ['255.255.255.255', 'broadcast'],

  // --- IPv6: loopback and unspecified, in every textual form ---
  ['::', 'unspecified, compressed'],
  ['0:0:0:0:0:0:0:0', 'unspecified, fully expanded'],
  ['::1', 'loopback, compressed'],
  ['0:0:0:0:0:0:0:1', 'loopback, fully expanded'],
  ['0000:0000:0000:0000:0000:0000:0000:0001', 'loopback, zero-padded'],

  // --- IPv6: scoped ranges ---
  ['fe80::1', 'link-local fe80::/10'],
  ['febf::1', 'link-local upper bound'],
  ['fc00::1', 'unique local fc00::/7'],
  ['fd12:3456::1', 'unique local fd00::/8'],
  ['ff02::1', 'multicast ff00::/8'],
  ['2001:db8::1', 'documentation 2001:db8::/32'],
  ['2001:0::1', 'Teredo 2001:0000::/32'],

  // --- IPv6: an IPv4 address hidden inside a transition mechanism ---
  ['::ffff:127.0.0.1', 'IPv4-mapped loopback, dotted'],
  ['::ffff:7f00:1', 'IPv4-mapped loopback, hex'],
  ['::ffff:169.254.169.254', 'IPv4-mapped metadata service'],
  ['::ffff:a00:1', 'IPv4-mapped private 10.0.0.1'],
  ['64:ff9b::7f00:1', 'NAT64 64:ff9b::/96 embedding 127.0.0.1'],
  ['64:ff9b::a9fe:a9fe', 'NAT64 embedding 169.254.169.254'],
  ['2002:7f00:1::', '6to4 2002::/16 embedding 127.0.0.1'],
  ['2002:a9fe:a9fe::', '6to4 embedding 169.254.169.254'],

  // --- malformed: must fail closed, not throw ---
  ['not-an-ip', 'unparseable string'],
  ['', 'empty string'],
];

const MUST_ALLOW = [
  ['8.8.8.8', 'public DNS'],
  ['1.1.1.1', 'public DNS'],
  ['93.184.216.34', 'public web host'],
  ['172.15.255.255', 'just below private 172.16/12'],
  ['172.32.0.1', 'just above private 172.16/12'],
  ['100.63.255.255', 'just below CGNAT'],
  ['100.128.0.1', 'just above CGNAT'],
  ['192.167.255.255', 'just below private 192.168/16'],
  ['192.169.0.1', 'just above private 192.168/16'],
  ['11.0.0.1', 'just above private 10/8'],
  ['2606:4700:4700::1111', 'public IPv6 (Cloudflare DNS)'],
  ['2001:4860:4860::8888', 'public IPv6 (Google DNS)'],
  ['::ffff:8.8.8.8', 'IPv4-mapped public address'],
  ['64:ff9b::808:808', 'NAT64 embedding public 8.8.8.8'],
  ['2002:808:808::', '6to4 embedding public 8.8.8.8'],
];

test('isPublicIp rejects private, loopback, link-local and embedded targets', () => {
  for (const [ip, why] of MUST_BLOCK) {
    assert.equal(isPublicIp(ip), false, `${ip} (${why}) must be blocked`);
  }
});

test('isPublicIp allows genuine public addresses', () => {
  for (const [ip, why] of MUST_ALLOW) {
    assert.equal(isPublicIp(ip), true, `${ip} (${why}) must be allowed`);
  }
});
