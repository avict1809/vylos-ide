import { CourseDefinition } from '../types';

export const networking: CourseDefinition = {
    id: 'networking',
    title: 'Computer Networking',
    tagline: 'How data really travels across the internet, explored hands-on with real tools and sockets.',
    level: 'Beginner → Intermediate',
    hours: 25,
    accent: '#14B8A6',
    badge: 'NET',
    category: 'essentials',
    stack: 'Python',
    tutorGuidelines: [
        'Only capture or inspect traffic on the learner\'s own machine and network, and only scan hosts they own (localhost is ideal).',
        'Networking commands differ by OS (ip vs ifconfig, ss vs netstat, traceroute vs tracert). Check the OS and confirm a tool is installed with "which <tool>" before using it.',
        'Show real command output (ping, dig, curl -v) instead of describing what it "would" show. Output depends on the learner\'s network, so do not predict exact IPs or timings.',
        'For examples, use private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or the documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) and example.com. Never use random real addresses.',
        'Protocol details are defined in RFCs. If unsure about a detail, say so rather than guessing, and do not invent RFC numbers.',
    ],
    modules: [
        {
            title: 'How the Internet Works',
            description: 'The big picture before the details.',
            lessons: [
                'What a network is',
                'Clients, servers, and peers',
                'What happens when you type a URL',
                'Packets and packet switching',
                'Bandwidth, latency, and throughput',
            ],
        },
        {
            title: 'Network Models',
            description: 'The layers that organize everything.',
            lessons: [
                'The OSI model',
                'The TCP/IP model',
                'Encapsulation: headers inside headers',
            ],
        },
        {
            title: 'Link Layer',
            description: 'Getting bits from one device to the next.',
            lessons: [
                'Ethernet and MAC addresses',
                'Switches and broadcast domains',
                'Wi-Fi basics',
                'ARP: mapping IPs to MACs',
            ],
        },
        {
            title: 'The Network Layer',
            description: 'Addressing and routing across networks.',
            lessons: [
                'IPv4 addresses',
                'Subnets and CIDR notation',
                'Exercise: subnetting practice',
                'Private addresses and NAT',
                'IPv6',
                'Routing and routing tables',
                'ICMP: ping and traceroute',
            ],
        },
        {
            title: 'The Transport Layer',
            description: 'Reliable and fast delivery between programs.',
            lessons: [
                'Ports and sockets',
                'UDP',
                'TCP and the three-way handshake',
                'Reliability: acknowledgments and retransmission',
                'Flow control and congestion control: the intuition',
                'Viewing connections with ss',
            ],
        },
        {
            title: 'The Application Layer',
            description: 'The protocols you use every day.',
            lessons: [
                'DNS in depth (with dig)',
                'HTTP/1.1 requests and responses',
                'HTTP/2 and HTTP/3 at a glance',
                'TLS and HTTPS',
                'DHCP',
                'Email protocols: SMTP, IMAP',
            ],
        },
        {
            title: 'Hands-On Tools',
            description: 'Inspect and debug real networks.',
            lessons: [
                'Checking interfaces and addresses',
                'Exploring HTTP with curl -v',
                'Capturing packets with tcpdump',
                'Reading a capture in Wireshark',
                'A network troubleshooting checklist',
            ],
        },
        {
            title: 'Network Programming',
            description: 'Build networked programs with Python sockets.',
            lessons: [
                'A TCP echo server and client',
                'A UDP example',
                'Handling multiple clients',
                'A tiny HTTP server from scratch',
                'Exercise: a terminal chat app',
            ],
        },
        {
            title: 'Network Security Basics',
            description: 'Keep networks safe.',
            lessons: [
                'Firewalls and ports',
                'VPNs',
                'Common network attacks and defenses',
                'Wi-Fi security',
            ],
        },
        {
            title: 'Capstone Project',
            description: 'Build and debug a networked application.',
            lessons: [
                'Designing a simple protocol',
                'Implementing server and client',
                'Inspecting your own traffic',
                'Handling errors and disconnects',
            ],
        },
    ],
};
