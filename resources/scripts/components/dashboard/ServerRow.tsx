import React, { memo, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEthernet, faHdd, faMemory, faMicrochip, faServer } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';
import { Server } from '@/api/server/getServer';
import getServerResourceUsage, { ServerPowerState, ServerStats } from '@/api/server/getServerResourceUsage';
import { bytesToHuman, megabytesToHuman } from '@/helpers';
import tw from 'twin.macro';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Spinner from '@/components/elements/Spinner';
import styled from 'styled-components/macro';
import isEqual from 'react-fast-compare';
import { useTranslation } from 'react-i18next';

// Determines if the current value is in an alarm threshold so we can show it in red rather
// than the more faded default style.
const isAlarmState = (current: number, limit: number): boolean => limit > 0 && (current / (limit * 1024 * 1024) >= 0.90);

const Icon = memo(styled(FontAwesomeIcon)<{ $alarm: boolean }>`
    ${props => props.$alarm ? tw`text-red-400` : tw`text-neutral-500`};
`, isEqual);

const IconDescription = styled.p<{ $alarm: boolean }>`
    ${tw`text-sm ml-2`};
    ${props => props.$alarm ? tw`text-white` : tw`text-neutral-400`};
`;

const StatusIndicatorBox = styled(GreyRowBox)<{ $status: ServerPowerState | undefined }>`
    ${tw`grid grid-cols-12 gap-4 relative`};
    
    & .status-bar {
        ${tw`w-2 bg-red-500 absolute right-0 z-20 rounded-full m-1 opacity-50 transition-all duration-150`};
        height: calc(100% - 0.5rem);
        
        ${({ $status }) => (!$status || $status === 'offline') ? tw`bg-red-500` : ($status === 'running' ? tw`bg-green-500` : tw`bg-yellow-500`)};
    }
    
    &:hover .status-bar {
        ${tw`opacity-75`};
    }
`;

export default ({ server, className }: { server: Server; className?: string }) => {
    const interval = useRef<number>(null);
    const [ isSuspended, setIsSuspended ] = useState(server.isSuspended);
    const [ stats, setStats ] = useState<ServerStats | null>(null);
    const { t } = useTranslation('dashboard');

    const getStats = () => getServerResourceUsage(server.uuid)
        .then(data => setStats(data))
        .catch(error => console.error(error));

    useEffect(() => {
        setIsSuspended(stats?.isSuspended || server.isSuspended);
    }, [ stats?.isSuspended, server.isSuspended ]);

    useEffect(() => {
        // Don't waste a HTTP request if there is nothing important to show to the user because
        // the server is suspended.
        if (isSuspended) return;

        getStats().then(() => {
            // @ts-ignore
            interval.current = setInterval(() => getStats(), 20000);
        });

        return () => {
            interval.current && clearInterval(interval.current);
        };
    }, [ isSuspended ]);

    const alarms = { cpu: false, memory: false, disk: false };
    if (stats) {
        alarms.cpu = server.limits.cpu === 0 ? false : (stats.cpuUsagePercent >= (server.limits.cpu * 0.9));
        alarms.memory = isAlarmState(stats.memoryUsageInBytes, server.limits.memory);
        alarms.disk = server.limits.disk === 0 ? false : isAlarmState(stats.diskUsageInBytes, server.limits.disk);
    }

    const disklimit = server.limits.disk !== 0 ? megabytesToHuman(server.limits.disk) : t('unlimited');
    const memorylimit = server.limits.memory !== 0 ? megabytesToHuman(server.limits.memory) : t('unlimited');

    return (
        <StatusIndicatorBox as={Link} to={`/server/${server.id}`} className={className} $status={stats?.status}>
            <div css={tw`flex items-center col-span-12 sm:col-span-5 lg:col-span-6`}>
                <div className={'icon'} css={tw`mr-4`}>
                    <FontAwesomeIcon icon={faServer}/>
                </div>
                <div>
                    <p css={tw`text-lg break-words`}>{server.name}</p>
                    {!!server.description &&
                    <p css={tw`text-sm text-neutral-300 break-words`}>{server.description}</p>
                    }
                </div>
            </div>
            <div css={tw`hidden lg:col-span-2 lg:flex ml-4 justify-end h-full`}>
                <FontAwesomeIcon icon={faEthernet} css={tw`text-neutral-500`}/>
                <p css={tw`text-sm text-neutral-400 ml-2`}>
                    {
                        server.allocations.filter(alloc => alloc.isDefault).map(allocation => (
                            <React.Fragment key={allocation.ip + allocation.port.toString()}>
                                {allocation.alias || allocation.ip}:{allocation.port}
                            </React.Fragment>
                        ))
                    }
                </p>
            </div>
            <div css={tw`hidden col-span-7 lg:col-span-4 sm:flex items-baseline justify-center`}>
                {(!stats || isSuspended) ?
                    isSuspended ?
                        <div css={tw`flex-1 text-center`}>
                            <span css={tw`bg-red-500 rounded px-2 py-1 text-red-100 text-xs`}>
                                {server.isSuspended ? 'Suspended' : 'Connection Error'}
                            </span>
                        </div>
                        :
                        server.isInstalling ?
                            <div css={tw`flex-1 text-center`}>
                                <span css={tw`bg-neutral-500 rounded px-2 py-1 text-neutral-100 text-xs`}>
                                    {t('installing')}
                                </span>
                            </div>
                            :
                            <Spinner size={'small'}/>
                    :
                    <React.Fragment>
                        <div css={tw`flex-1 flex md:ml-4 sm:flex hidden justify-center`}>
                            <Icon icon={faMicrochip} $alarm={alarms.cpu}/>
                            <IconDescription $alarm={alarms.cpu}>
                                {stats.cpuUsagePercent} %
                            </IconDescription>
                        </div>
                        <div css={tw`flex-1 ml-4 sm:block hidden`}>
                            <div css={tw`flex justify-center`}>
                                <Icon icon={faMemory} $alarm={alarms.memory}/>
                                <IconDescription $alarm={alarms.memory}>
                                    {bytesToHuman(stats.memoryUsageInBytes)}
                                </IconDescription>
                            </div>
                            <p css={tw`text-xs text-neutral-600 text-center mt-1`}>{t('of')} {memorylimit}</p>
                        </div>
                        <div css={tw`flex-1 ml-4 sm:block hidden`}>
                            <div css={tw`flex justify-center`}>
                                <Icon icon={faHdd} $alarm={alarms.disk}/>
                                <IconDescription $alarm={alarms.disk}>
                                    {bytesToHuman(stats.diskUsageInBytes)}
                                </IconDescription>
                            </div>
                            <p css={tw`text-xs text-neutral-600 text-center mt-1`}>{t('of')} {disklimit}</p>
                        </div>
                    </React.Fragment>
                }
            </div>
            <div className={'status-bar'}/>
        </StatusIndicatorBox>
    );
};
